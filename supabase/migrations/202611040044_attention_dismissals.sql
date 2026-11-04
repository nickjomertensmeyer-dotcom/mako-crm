-- Needs attention: remember which items each person has dismissed, so it follows them across devices.
-- New table only; nothing existing is changed. Each user sees and edits only their own rows.
begin;
create table public.attention_dismissals(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 item_key text not null check(item_key ~ '^(lead|invoice|work|conn):[A-Za-z0-9_-]{1,64}$'),
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id,item_key)
);
alter table public.attention_dismissals enable row level security;
revoke all on public.attention_dismissals from public,anon,authenticated;
grant select,insert,delete on public.attention_dismissals to authenticated;
create policy attention_dismissals_own on public.attention_dismissals for all to authenticated
 using(user_id=(select auth.uid()) and public.is_workspace_member(workspace_id))
 with check(user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));
commit;
