begin;
alter table public.contacts add column pipeline_stage text not null default 'New' check (pipeline_stage in ('New','Contacted','Qualified','Won'));
create table public.support_requests (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 subject text not null check(length(subject) between 3 and 160),details text not null check(length(details) between 10 and 4000),
 category text not null check(category in ('Technical help','Bug report','Configuration change','Security issue')),
 priority text not null default 'priority',status text not null default 'Open' check(status in ('Open','In progress','Resolved')),
 created_at timestamptz not null default now()
);
create table public.email_followups (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,
 recipient text not null,subject text not null check(length(subject) between 3 and 160),body text not null check(length(body) between 10 and 4000),
 scheduled_at timestamptz not null,consent_confirmed boolean not null check(consent_confirmed),
 status text not null default 'Queued' check(status in ('Queued','Processing','Sent','Failed','Cancelled')),
 provider_id text,error text,created_at timestamptz not null default now()
);
create index followups_due on public.email_followups(scheduled_at) where status='Queued';
create table public.feature_usage(workspace_id uuid references public.workspaces(id) on delete cascade,day date not null default current_date,feature text not null,used integer not null default 0,primary key(workspace_id,day,feature));
alter table public.support_requests enable row level security;
alter table public.email_followups enable row level security;
alter table public.feature_usage enable row level security;
revoke all on public.support_requests,public.email_followups,public.feature_usage from anon,authenticated;
grant select on public.support_requests,public.email_followups,public.feature_usage to authenticated;
grant all on public.email_followups to service_role;
create policy support_read on public.support_requests for select to authenticated using(public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy followups_read on public.email_followups for select to authenticated using(public.is_workspace_member(workspace_id));
create policy usage_read on public.feature_usage for select to authenticated using(public.is_workspace_member(workspace_id));
create function public.require_pro(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_workspace_member(target) or not exists(select 1 from public.workspaces where id=target and status='active' and plan in ('pro','custom')) then raise exception 'Active Pro or Custom workspace required';end if;
end $$;
create function public.reserve_feature(target uuid,feature_name text) returns void language plpgsql security definer set search_path='' as $$
declare cap integer; current_used integer;
begin
 perform public.require_pro(target);
 cap:=case feature_name when 'ai' then 30 when 'email' then 100 else 0 end;
 if cap=0 then raise exception 'Unknown feature';end if;
 insert into public.feature_usage(workspace_id,feature,used) values(target,feature_name,1)
 on conflict(workspace_id,day,feature) do update set used=public.feature_usage.used+1 where public.feature_usage.used<cap
 returning used into current_used;
 if current_used is null then raise exception 'Daily usage limit reached';end if;
end $$;
-- Only trusted RPCs can consume usage; callers cannot forge counters or change limits.
create function public.use_ai(target uuid) returns void language plpgsql security definer set search_path='' as $$begin perform public.reserve_feature(target,'ai');end $$;
create function public.queue_followup(target uuid,customer uuid,email_subject text,email_body text,send_at timestamptz,confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare destination text;
begin
 perform public.require_pro(target);
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 if not public.can_work(target,'customers') then raise exception 'Customer tools required';end if;
 select email into destination from public.contacts where id=customer and workspace_id=target;
 if destination is null or destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid customer email is required';end if;
 if confirmed is distinct from true or send_at<now() or send_at>now()+interval '90 days' then raise exception 'Confirm consent and choose a future date within 90 days';end if;
 perform public.reserve_feature(target,'email');
 insert into public.email_followups(workspace_id,contact_id,recipient,subject,body,scheduled_at,consent_confirmed) values(target,customer,destination,trim(email_subject),trim(email_body),send_at,true);
end $$;
create function public.cancel_followup(target uuid,item uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 update public.email_followups set status='Cancelled' where id=item and workspace_id=target and status='Queued';
end $$;
create function public.request_support(target uuid,title text,description text,kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_pro(target);
 if(select count(*) from public.support_requests where workspace_id=target and created_at>now()-interval '1 day')>=10 then raise exception 'Daily request limit reached';end if;
 insert into public.support_requests(workspace_id,subject,details,category) values(target,trim(title),trim(description),kind);
end $$;
create function public.update_support(item uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator required';end if;
 update public.support_requests set status=new_status where id=item;
end $$;
create function public.claim_followups() returns setof public.email_followups language sql security definer set search_path='' as $$
 update public.email_followups set status='Processing' where id in (
 select f.id from public.email_followups f join public.workspaces w on w.id=f.workspace_id
 where f.status='Queued' and f.scheduled_at<=now() and w.status='active' and w.plan in ('pro','custom')
 and ('customers'=any(w.modules) or 'leads'=any(w.modules)) order by f.scheduled_at limit 20 for update of f skip locked
 ) returning *;
$$;
revoke all on function public.require_pro(uuid),public.reserve_feature(uuid,text),public.use_ai(uuid),public.queue_followup(uuid,uuid,text,text,timestamptz,boolean),public.cancel_followup(uuid,uuid),public.request_support(uuid,text,text,text),public.update_support(uuid,text),public.claim_followups() from public;
grant execute on function public.use_ai(uuid),public.queue_followup(uuid,uuid,text,text,timestamptz,boolean),public.cancel_followup(uuid,uuid),public.request_support(uuid,text,text,text),public.update_support(uuid,text) to authenticated;
grant execute on function public.claim_followups() to service_role;
create function public.export_workspace(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Workspace owner required';end if;
 if (select count(*) from public.contacts where workspace_id=target)+(select count(*) from public.tasks where workspace_id=target)+(select count(*) from public.email_followups where workspace_id=target)+(select count(*) from public.support_requests where workspace_id=target)>50000 then raise exception 'Contact Mako for a large workspace export';end if;
 return jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target),'contacts',coalesce((select jsonb_agg(c) from public.contacts c where workspace_id=target),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(t) from public.tasks t where workspace_id=target),'[]'::jsonb),'followups',coalesce((select jsonb_agg(f) from public.email_followups f where workspace_id=target),'[]'::jsonb),'support_requests',coalesce((select jsonb_agg(s) from public.support_requests s where workspace_id=target),'[]'::jsonb));
end $$;
revoke all on function public.export_workspace(uuid) from public;
grant execute on function public.export_workspace(uuid) to authenticated;
commit;
