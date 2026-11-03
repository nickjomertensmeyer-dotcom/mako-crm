begin;
-- Encrypted owner credentials and a short-lived report cache; no browser-role access.
create table if not exists public.owner_search_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 credential text not null,
 scopes text not null,
 report jsonb,
 updated_at timestamptz not null default now()
);
alter table public.owner_search_connections enable row level security;
revoke all on public.owner_search_connections from public, anon, authenticated;
grant select, insert, update, delete on public.owner_search_connections to service_role;
commit;
