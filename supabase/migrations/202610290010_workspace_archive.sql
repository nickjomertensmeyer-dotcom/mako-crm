begin;
alter table public.workspaces add column archived_at timestamptz;
create table public.workspace_admin_history(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),actor_id uuid references auth.users(id),action text not null,created_at timestamptz not null default now());
alter table public.workspace_admin_history enable row level security;
revoke all on public.workspace_admin_history from anon,authenticated;
grant select on public.workspace_admin_history to authenticated;
create policy admin_history_read on public.workspace_admin_history for select to authenticated using(public.is_platform_admin());
create or replace function public.is_workspace_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m join public.workspaces w on w.id=m.workspace_id where m.workspace_id=target and m.user_id=auth.uid() and w.archived_at is null);
$$;
-- Keep the workspace shell discoverable so removed businesses can see an explanation.
alter policy workspace_read on public.workspaces to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.workspace_id=id and m.user_id=auth.uid()));
create function public.archive_workspace(target uuid,confirmed_name text,restore boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare w public.workspaces;
begin
 if not public.is_platform_admin() then raise exception 'Platform administrator required'; end if;
 select * into w from public.workspaces where id=target for update;
 if not found or confirmed_name is distinct from w.name then raise exception 'Enter the exact business name'; end if;
 if restore then
  if w.archived_at is null then return; end if;
  update public.workspaces set archived_at=null,status='suspended' where id=target;
 else
  if w.archived_at is not null then return; end if;
  update public.workspaces set archived_at=now(),status='suspended' where id=target;
 end if;
 insert into public.workspace_admin_history(workspace_id,actor_id,action) values(target,auth.uid(),case when restore then 'Restored (suspended)' else 'Archived' end);
end $$;
create function public.guard_archived_workspace() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.archived_at is not null and not public.is_platform_admin() then raise exception 'Workspace is archived'; end if;
 if new.archived_at is not null and new.status<>'suspended' then raise exception 'Restore the workspace before activating access'; end if;
 return new;
end $$;
create trigger guard_archived_workspace before update on public.workspaces for each row execute function public.guard_archived_workspace();
revoke all on function public.archive_workspace(uuid,text,boolean),public.guard_archived_workspace() from public,anon;
grant execute on function public.archive_workspace(uuid,text,boolean) to authenticated;
commit;
