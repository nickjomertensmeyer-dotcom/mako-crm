begin;
-- Credentials are server-only, encrypted, and scoped to one member in one workspace.
create table public.google_calendar_connections (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 refresh_token text not null,
 calendar_id text,
 time_zone text not null,
 last_synced_at timestamptz,
 sync_until timestamptz,
 sync_token uuid,
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id)
);
alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from public,anon,authenticated;
grant all on public.google_calendar_connections to service_role;
comment on table public.google_calendar_connections is 'Server-only encrypted Google refresh tokens. Access must recheck current workspace membership and paid access.';
commit;
