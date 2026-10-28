begin;
create table public.workspace_backups (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 day date not null default current_date,status text not null default 'Processing' check(status in ('Processing','Complete','Failed')),
 object_path text not null,created_at timestamptz not null default now(),unique(workspace_id,day)
);
alter table public.workspace_backups enable row level security;
revoke all on public.workspace_backups from anon,authenticated;
grant select on public.workspace_backups to authenticated;
grant all on public.workspace_backups to service_role;
create policy backup_read on public.workspace_backups for select to authenticated using(public.is_workspace_member(workspace_id));
create function public.claim_backups() returns setof public.workspace_backups language sql security definer set search_path='' as $$
 insert into public.workspace_backups(workspace_id,object_path)
 select w.id,w.id::text||'/'||current_date::text||'.json' from public.workspaces w where w.status='active' and w.plan in ('pro','custom')
 and not exists(select 1 from public.workspace_backups b where b.workspace_id=w.id and b.day=current_date)
 order by w.created_at limit 20 on conflict(workspace_id,day) do nothing returning *;
$$;
create function public.backup_payload(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.contacts where workspace_id=target)+(select count(*) from public.tasks where workspace_id=target)+(select count(*) from public.email_followups where workspace_id=target)+(select count(*) from public.support_requests where workspace_id=target)>50000 then raise exception 'Large workspace backup needs a dedicated job';end if;
 return jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target),'contacts',coalesce((select jsonb_agg(c) from public.contacts c where workspace_id=target),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(t) from public.tasks t where workspace_id=target),'[]'::jsonb),'followups',coalesce((select jsonb_agg(f) from public.email_followups f where workspace_id=target),'[]'::jsonb),'support_requests',coalesce((select jsonb_agg(s) from public.support_requests s where workspace_id=target),'[]'::jsonb));
end $$;
revoke all on function public.claim_backups(),public.backup_payload(uuid) from public,anon,authenticated;
grant execute on function public.claim_backups(),public.backup_payload(uuid) to service_role;
commit;
