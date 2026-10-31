begin;
-- Minimal daily aggregates: no customer content, record IDs, IPs, or document amounts.
create table public.pilot_activity_config(id boolean primary key default true check(id),started_at timestamptz not null default now());
insert into public.pilot_activity_config default values;
alter table public.pilot_invitations add column activity_excluded boolean not null default false;
update public.pilot_invitations set activity_excluded=true where email in ('nixywix33@gmail.com','nickjomertensmeyer@gmail.com','nickmerts434@gmail.com','nixifycrm@gmail.com','nickandpickmarketing@gmail.com','nickpickmarketing@gmail.com');
create table public.pilot_activity_days(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 day date not null,event text not null check(event in ('visit','contact_added','work_created','linked_work_created','progress','record_updated')),
 first_at timestamptz not null default now(),last_at timestamptz not null default now(),
 primary key(workspace_id,day,event)
);
alter table public.pilot_activity_days enable row level security;
alter table public.pilot_activity_config enable row level security;
revoke all on public.pilot_activity_days,public.pilot_activity_config from public,anon,authenticated;

create function public.capture_pilot_activity(target uuid,kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 -- User actions only. Background jobs and platform-admin QA do not count.
 if auth.uid() is null or public.is_platform_admin() or not public.is_workspace_member(target) then return;end if;
 if not exists(select 1 from public.pilot_invitations where workspace_id=target and accepted_at is not null and revoked_at is null and not activity_excluded) then return;end if;
 insert into public.pilot_activity_days(workspace_id,day,event) values(target,(now() at time zone 'UTC')::date,kind)
 on conflict(workspace_id,day,event) do update set last_at=excluded.last_at;
end $$;
revoke all on function public.capture_pilot_activity(uuid,text) from public,anon,authenticated;

create function public.record_pilot_visit(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace membership required';end if;
 perform public.capture_pilot_activity(target,'visit');
end $$;
revoke all on function public.record_pilot_visit(uuid) from public,anon,authenticated;
grant execute on function public.record_pilot_visit(uuid) to authenticated;

create function public.pilot_record_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);oldr jsonb;kind text;
begin
 if tg_op='INSERT' then
  kind:=case when tg_table_name='contacts' then 'contact_added' when tg_table_name='invoice_payments' then 'progress' else 'work_created' end;
  perform public.capture_pilot_activity(new.workspace_id,kind);
  if tg_table_name in ('tasks','work_items','business_documents') and coalesce(r->>'contact_id',r->>'customer_id') is not null then
   perform public.capture_pilot_activity(new.workspace_id,'linked_work_created');
  end if;
 else
  oldr:=to_jsonb(old);
  if r is not distinct from oldr then return new;end if;
  perform public.capture_pilot_activity(new.workspace_id,'record_updated');
  if (tg_table_name='tasks' and r->>'completed'='true' and oldr->>'completed' is distinct from 'true')
   or (tg_table_name='contacts' and (r->>'stage' is distinct from oldr->>'stage' or r->>'pipeline_stage' is distinct from oldr->>'pipeline_stage' or r->>'relationship_status' is distinct from oldr->>'relationship_status'))
   or (tg_table_name='work_items' and r->>'status'='Completed' and oldr->>'status' is distinct from 'Completed') then
   perform public.capture_pilot_activity(new.workspace_id,'progress');
  end if;
  if tg_table_name in ('tasks','work_items','business_documents') and coalesce(r->>'contact_id',r->>'customer_id') is not null
   and coalesce(r->>'contact_id',r->>'customer_id') is distinct from coalesce(oldr->>'contact_id',oldr->>'customer_id') then
   perform public.capture_pilot_activity(new.workspace_id,'linked_work_created');
  end if;
 end if;
 return new;
end $$;
revoke all on function public.pilot_record_activity() from public,anon,authenticated;
create trigger pilot_contacts after insert or update on public.contacts for each row execute function public.pilot_record_activity();
create trigger pilot_tasks after insert or update on public.tasks for each row execute function public.pilot_record_activity();
create trigger pilot_work after insert or update on public.work_items for each row execute function public.pilot_record_activity();
create trigger pilot_documents after insert or update on public.business_documents for each row execute function public.pilot_record_activity();
create trigger pilot_payments after insert on public.invoice_payments for each row execute function public.pilot_record_activity();

create function public.exclude_pilot_activity(invitation uuid,excluded boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator required';end if;
 update public.pilot_invitations set activity_excluded=excluded where id=invitation;
end $$;
revoke all on function public.exclude_pilot_activity(uuid,boolean) from public,anon,authenticated;
grant execute on function public.exclude_pilot_activity(uuid,boolean) to authenticated;

create function public.owner_pilot_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Administrator required';end if;
 select jsonb_build_object('started_at',(select started_at from public.pilot_activity_config),'rows',coalesce(jsonb_agg(to_jsonb(x) order by x.invited_at desc),'[]'::jsonb)) into result from (
 select i.id,i.email,i.created_at invited_at,i.accepted_at,i.ends_at,i.expires_at,i.revoked_at,i.activity_excluded excluded,w.name business,
  exists(select 1 from auth.users u where lower(u.email)=i.email and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null) verified,
  exists(select 1 from public.workspace_live_billing b where b.workspace_id=i.workspace_id and b.subscription_id is not null and b.subscription_status='active') subscribed,
  a.last_active,a.last_meaningful,a.contact_at,a.work_at,a.progress_at,a.returned,
  (a.contact_week and a.linked_week and a.returned_week) activated
 from public.pilot_invitations i left join public.workspaces w on w.id=i.workspace_id
 left join lateral (
  select max(last_at) last_active,max(last_at) filter(where event<>'visit') last_meaningful,
   min(first_at) filter(where event='contact_added') contact_at,
   min(first_at) filter(where event='work_created') work_at,
   min(first_at) filter(where event='progress') progress_at,
   count(distinct day)>1 returned,
   coalesce(bool_or(event='contact_added' and first_at<i.accepted_at+interval '7 days'),false) contact_week,
   coalesce(bool_or(event='linked_work_created' and first_at<i.accepted_at+interval '7 days'),false) linked_week,
   count(distinct day) filter(where first_at<i.accepted_at+interval '7 days')>1 returned_week
  from public.pilot_activity_days where workspace_id=i.workspace_id and first_at>=i.accepted_at
 ) a on true
 ) x;
 return result;
end $$;
revoke all on function public.owner_pilot_activity() from public,anon,authenticated;
grant execute on function public.owner_pilot_activity() to authenticated;
commit;
