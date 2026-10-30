begin;
alter table public.workspaces add column pilot_ends_at timestamptz;
create table public.pilot_invitations (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '14 days',accepted_at timestamptz,
 workspace_id uuid unique references public.workspaces(id),ends_at timestamptz,revoked_at timestamptz,
 check(email=lower(trim(email)) and length(email)<=254)
);
alter table public.pilot_invitations enable row level security;
revoke all on public.pilot_invitations from public,anon,authenticated;
grant select(id,email,created_by,created_at,expires_at,accepted_at,workspace_id,ends_at,revoked_at) on public.pilot_invitations to authenticated;
create policy pilot_admin_read on public.pilot_invitations for select to authenticated using(public.is_platform_admin());
create function public.create_pilot_invitation(recipient text,secret_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.is_platform_admin() then raise exception 'Administrator required';end if;
 recipient=lower(trim(recipient));
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(recipient)>254 then raise exception 'Invalid email';end if;
 insert into public.pilot_invitations(email,token_hash,created_by) values(recipient,secret_hash,auth.uid())
 on conflict(email) do update set token_hash=excluded.token_hash,expires_at=now()+interval '14 days',revoked_at=null
 where pilot_invitations.accepted_at is null returning id into result;
 if result is null then raise exception 'Pilot already accepted';end if;
 return result;
end $$;
create function public.accept_pilot_invitation(secret_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.pilot_invitations;business public.workspaces;address text;deadline timestamptz;
begin
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if address is null then raise exception 'Verified account required';end if;
 select * into invitation from public.pilot_invitations where token_hash=secret_hash for update;
 if not found or invitation.email<>address or invitation.revoked_at is not null then raise exception 'Invitation unavailable';end if;
 select w.* into business from public.workspaces w join public.memberships m on m.workspace_id=w.id
 where m.user_id=auth.uid() and m.role='owner' order by m.created_at limit 1 for update of w;
 if not found then raise exception 'Workspace owner required';end if;
 if invitation.accepted_at is not null then
  if invitation.workspace_id=business.id then return business.id;end if;
  raise exception 'Invitation already accepted';
 end if;
 if invitation.expires_at<=now() or business.status<>'pending' or business.plan<>'pending' or business.archived_at is not null or business.billing_admin_hold
 or exists(select 1 from public.pilot_invitations where workspace_id=business.id)
 or exists(select 1 from public.workspace_live_billing where workspace_id=business.id and subscription_id is not null)
 or exists(select 1 from public.workspace_billing where workspace_id=business.id and subscription_id is not null)
 then raise exception 'Workspace not eligible';end if;
 deadline=now()+interval '14 days';
 update public.workspaces set plan='pro',status='active',pilot_ends_at=deadline where id=business.id;
 update public.pilot_invitations set accepted_at=now(),workspace_id=business.id,ends_at=deadline where id=invitation.id;
 return business.id;
end $$;
create function public.revoke_pilot_invitation(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.pilot_invitations;
begin
 if not public.is_platform_admin() then raise exception 'Administrator required';end if;
 select * into invitation from public.pilot_invitations where id=target for update;
 if not found then raise exception 'Invitation unavailable';end if;
 update public.pilot_invitations set revoked_at=coalesce(revoked_at,now()) where id=target;
 update public.workspaces set pilot_ends_at=least(pilot_ends_at,now()),status='suspended'
 where id=invitation.workspace_id and pilot_ends_at is not null and plan='pro' and archived_at is null;
end $$;
create function public.expire_pilots() returns void language sql security definer set search_path='' as $$
 update public.workspaces set status='suspended' where pilot_ends_at<=now() and plan='pro' and status='active' and archived_at is null;
$$;
revoke all on function public.create_pilot_invitation(text,text),public.accept_pilot_invitation(text),public.revoke_pilot_invitation(uuid),public.expire_pilots() from public,anon,authenticated;
grant execute on function public.create_pilot_invitation(text,text),public.accept_pilot_invitation(text),public.revoke_pilot_invitation(uuid) to authenticated;
grant execute on function public.expire_pilots() to service_role;
-- Expiry guards and billing reconciliation are appended below.

create or replace function public.can_work(target uuid, feature text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_member(target) and exists(select 1 from public.workspaces where id=target and status='active' and (pilot_ends_at is null or pilot_ends_at>now()) and (feature=any(modules) or (feature='customers' and 'leads'=any(modules))));
$$;

create or replace function public.require_pro(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_workspace_member(target) or not exists(select 1 from public.workspaces where id=target and status='active' and (pilot_ends_at is null or pilot_ends_at>now()) and plan in ('pro','custom')) then raise exception 'Active Pro or Custom workspace required';end if;
end $$;

create or replace function public.claim_followups() returns setof public.email_followups language sql security definer set search_path='' as $$
 update public.email_followups set status='Processing' where id in (
 select f.id from public.email_followups f join public.workspaces w on w.id=f.workspace_id
 where f.status='Queued' and f.scheduled_at<=now() and w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and w.plan in ('pro','custom')
 and ('customers'=any(w.modules) or 'leads'=any(w.modules)) order by f.scheduled_at limit 20 for update of f skip locked
 ) returning *;
$$;

create or replace function public.claim_backups() returns setof public.workspace_backups language sql security definer set search_path='' as $$
 insert into public.workspace_backups(workspace_id,object_path)
 select w.id,w.id::text||'/'||current_date::text||'.json' from public.workspaces w where w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and w.plan in ('pro','custom')
 and not exists(select 1 from public.workspace_backups b where b.workspace_id=w.id and b.day=current_date)
 order by w.created_at limit 20 on conflict(workspace_id,day) do nothing returning *;
$$;

create or replace function public.run_board_rule(target uuid,rule_name text,event text,record_uuid uuid,recipient uuid,title text) returns void language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 if not exists(select 1 from public.workflow_rules where workspace_id=target and rule=rule_name and enabled) then return;end if;
 if rule_name in ('lead_won','task_assigned','task_overdue') and not exists(select 1 from public.workspaces where id=target and status='active' and (pilot_ends_at is null or pilot_ends_at>now()) and 'tasks'=any(modules)) then return;end if;
 insert into public.workflow_runs(workspace_id,rule,event_key) values(target,rule_name,event) on conflict do nothing returning id into claimed;
 if claimed is null then return;end if;
 if rule_name='lead_won' then
  insert into public.tasks(workspace_id,title,contact_id,owner_id) values(target,'Onboard: '||left(title,180),record_uuid,recipient);
 else
  if recipient is not null then insert into public.workspace_notifications(workspace_id,user_id,message,record_id,board,event_key) values(target,recipient,title,record_uuid,case when rule_name='followup_due' then 'leads' else 'tasks' end,rule_name||':'||event) on conflict do nothing;end if;
 end if;
end $$;

create or replace function public.run_scheduled_board_rules() returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
 for r in select t.* from public.tasks t join public.workspaces w on w.id=t.workspace_id where w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and w.plan in ('pro','custom') and 'tasks'=any(w.modules) and t.archived_at is null and not t.completed and t.due_date<current_date and t.owner_id is not null loop
  perform public.run_board_rule(r.workspace_id,'task_overdue',r.id||':'||r.due_date,r.id,r.owner_id,'Overdue: '||r.title);n:=n+1;
 end loop;
 for r in select c.*,coalesce(c.owner_id,(select user_id from public.memberships where workspace_id=c.workspace_id and role='owner' order by created_at limit 1)) recipient from public.contacts c join public.workspaces w on w.id=c.workspace_id where w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and w.plan in ('pro','custom') and ('leads'=any(w.modules) or 'customers'=any(w.modules)) and c.archived_at is null and c.followup_date<=current_date loop
  perform public.run_board_rule(r.workspace_id,'followup_due',r.id||':'||r.followup_date,r.id,r.recipient,'Follow up: '||r.name);n:=n+1;
 end loop;return n;
end $$;

create or replace function public.public_booking_slots(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'starts_at',r.details->>'starts_at','minutes',r.details->>'minutes','business',w.name) order by r.details->>'starts_at'),'[]') from public.operation_records r join public.workspaces w on w.id=r.workspace_id where r.workspace_id=target and r.kind='slot' and r.status='Published' and not r.archived and w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and w.plan in ('pro','custom') and 'booking'=any(w.modules) and 'schedule'=any(w.modules) and (r.details->>'starts_at')::timestamptz>now() and not exists(select 1 from public.booking_requests b where b.slot_id=r.id and not b.cancelled)
 $$;

create or replace function public.run_service_plans() returns integer language plpgsql security definer set search_path='' as $$
declare p public.operation_records;d date;w uuid;n integer:=0;step interval;
begin
 for p in select r.* from public.operation_records r join public.workspaces b on b.id=r.workspace_id where r.kind='plan' and r.status='Active' and not r.archived and b.status='active' and (b.pilot_ends_at is null or b.pilot_ends_at>now()) and b.plan in ('pro','custom') and 'recurring'=any(b.modules) and 'jobs'=any(b.modules) for update of r skip locked loop
 d:=(p.details->>'next_date')::date;step:=case p.details->>'frequency' when 'Weekly' then interval '7 days' else interval '1 month' end;
 for i in 1..30 loop
 exit when d>(now() at time zone (p.details->>'timezone'))::date;
 if p.details->>'renewal'<>'' and d>(p.details->>'renewal')::date then update public.operation_records set status='Paused',version=version+1 where id=p.id;exit;end if;
 if not exists(select 1 from public.plan_visits where plan_id=p.id and visit_date=d) then
 insert into public.work_items(workspace_id,kind,title,customer_id,scheduled_date,notes) values(p.workspace_id,'Job',p.title,p.customer_id,d,'Service plan: '||p.id||'. '||p.notes) returning id into w;
 insert into public.plan_visits values(p.id,d,w);n:=n+1;end if;
 d:=(d+step)::date;
 end loop;
 update public.operation_records set details=jsonb_set(details,'{next_date}',to_jsonb(d::text)),version=version+1 where id=p.id;
 end loop;return n;
end $$;

create or replace function public.operation_reminders() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.workspace_notifications(workspace_id,user_id,message,board,event_key)
 select r.workspace_id,m.user_id,'Appointment in the next 24 hours: '||r.title,'booking','appointment:'||r.id||':'||(r.details->>'starts_at') from public.operation_records r join public.workspaces w on w.id=r.workspace_id join public.memberships m on m.workspace_id=r.workspace_id and m.role='owner' where r.kind='slot' and r.status='Published' and not r.archived and w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and 'booking'=any(w.modules) and (r.details->>'starts_at')::timestamptz between now() and now()+interval '24 hours' and exists(select 1 from public.booking_requests b where b.slot_id=r.id and not b.cancelled) on conflict do nothing;
 insert into public.workspace_notifications(workspace_id,user_id,message,board,event_key)
 select r.workspace_id,m.user_id,'Service plan renewal due: '||r.title,'recurring','renewal:'||r.id||':'||(r.details->>'renewal') from public.operation_records r join public.workspaces w on w.id=r.workspace_id join public.memberships m on m.workspace_id=r.workspace_id and m.role='owner' where r.kind='plan' and r.status='Active' and not r.archived and w.status='active' and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and 'recurring'=any(w.modules) and nullif(r.details->>'renewal','')::date between current_date and current_date+7 on conflict do nothing;
end $$;

create or replace function public.submit_website_lead(form_uuid uuid,submission_uuid uuid,address_key text,person jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare form_row public.website_lead_forms;contact_uuid uuid;
begin
 select * into form_row from public.website_lead_forms where id=form_uuid and enabled for update;
 if not found or not exists(select 1 from public.workspaces where id=form_row.workspace_id and status='active' and (pilot_ends_at is null or pilot_ends_at>now()) and plan in ('pro','custom') and 'leads'=any(modules) and (to_jsonb(workspaces)->>'archived_at') is null) then raise exception 'Form unavailable';end if;
 if length(address_key)<>64 or length(trim(coalesce(person->>'name',''))) not between 1 and 120 or coalesce(person->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(person->>'email',''))>254 or length(coalesce(person->>'message',''))>4000 then raise exception 'Invalid enquiry';end if;
 if exists(select 1 from public.website_lead_submissions where id=submission_uuid) then return;end if;
 if (select count(*) from public.website_lead_submissions where form_id=form_uuid and created_at>now()-interval '1 hour' and address_hash=address_key)>=5 or (select count(*) from public.website_lead_submissions where form_id=form_uuid and created_at>now()-interval '1 day')>=200 then raise exception 'Too many enquiries. Try later.';end if;
 perform pg_advisory_xact_lock(hashtextextended(form_row.workspace_id::text||lower(person->>'email'),0));
 select id into contact_uuid from public.contacts where workspace_id=form_row.workspace_id and lower(email)=lower(person->>'email') limit 1;
 if contact_uuid is null then insert into public.contacts(workspace_id,name,email,phone,stage,notes) values(form_row.workspace_id,trim(person->>'name'),lower(person->>'email'),left(coalesce(person->>'phone',''),40),'Lead','Website enquiry: '||coalesce(person->>'message','')) returning id into contact_uuid;
 else insert into public.record_activity(workspace_id,record_id,record_type,action,details) values(form_row.workspace_id,contact_uuid,'contacts','Website enquiry',jsonb_build_object('message',jsonb_build_object('from',null,'to',person->>'message')));end if;
 insert into public.website_lead_submissions values(submission_uuid,form_uuid,address_key,now());
end $$;

create or replace function public.apply_billing_sync(customer text,event_key text,token uuid,subscription text,new_status text,entitled boolean,cancel_end boolean) returns void language plpgsql security definer set search_path='' as $$
declare b public.workspace_billing;w public.workspaces;
begin
 select * into b from public.workspace_billing where stripe_customer_id=customer for update;
 if not found or b.sync_token is distinct from token or b.sync_until<now() then raise exception 'Invalid synchronization lease'; end if;
 select * into w from public.workspaces where id=b.workspace_id for update;
 update public.workspace_billing set subscription_id=subscription,subscription_status=new_status,cancel_at_period_end=cancel_end,synced_at=now(),sync_token=null,sync_until=null where workspace_id=b.workspace_id;
 -- Billing can never undo an administrative hold, an archive, or a Custom agreement.
 if w.archived_at is null and not w.billing_admin_hold and w.plan<>'custom' then
  update public.workspaces set plan=case when entitled or subscription is not null then 'pro' else plan end,pilot_ends_at=case when entitled then null else pilot_ends_at end,status=case when entitled or w.pilot_ends_at>now() then 'active' when w.pilot_ends_at<=now() then 'suspended' when subscription is not null or b.subscription_id is not null then 'suspended' else status end where id=w.id;
 end if;
 insert into public.billing_events(event_id,workspace_id) values(event_key,w.id) on conflict do nothing;
end $$;

create or replace function public.apply_live_billing_sync(customer text,event_key text,token uuid,subscription text,new_status text,entitled boolean,cancel_end boolean) returns void language plpgsql security definer set search_path='' as $$
declare b public.workspace_live_billing;w public.workspaces;
begin
 select * into b from public.workspace_live_billing where stripe_customer_id=customer for update;
 if not found or b.sync_token is distinct from token or b.sync_until<now() then raise exception 'Invalid synchronization lease'; end if;
 select * into w from public.workspaces where id=b.workspace_id for update;
 update public.workspace_live_billing set subscription_id=subscription,subscription_status=new_status,cancel_at_period_end=cancel_end,synced_at=now(),sync_token=null,sync_until=null where workspace_id=b.workspace_id;
 -- Billing can never undo an administrative hold, an archive, or a Custom agreement.
 if w.archived_at is null and not w.billing_admin_hold and w.plan<>'custom' then
  update public.workspaces set plan=case when entitled or subscription is not null then 'pro' else plan end,pilot_ends_at=case when entitled then null else pilot_ends_at end,status=case when entitled or w.pilot_ends_at>now() then 'active' when w.pilot_ends_at<=now() then 'suspended' when subscription is not null or b.subscription_id is not null then 'suspended' else status end where id=w.id;
 end if;
 insert into public.billing_events(event_id,workspace_id) values(event_key,w.id) on conflict do nothing;
end $$;

create or replace function public.provision_workspace(target uuid,new_plan text,new_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Platform administrator required'; end if;
 update public.workspaces set plan=new_plan,status=new_status,billing_admin_hold=(new_status='suspended'),pilot_ends_at=null where id=target;
end $$;
commit;
