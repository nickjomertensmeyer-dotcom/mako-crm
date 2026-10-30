begin;
create table public.qb_api_events(
 reference uuid primary key,
 workspace_id uuid references public.workspaces(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 environment text not null check(environment in ('sandbox','production')),
 operation text not null check(length(operation)<=60),method text not null check(method in ('GET','POST')),
 status integer not null check(status between 0 and 599),intuit_tid text not null default '' check(length(intuit_tid)<=128),
 code text not null default '' check(length(code)<=40),category text not null check(category in ('network','invalid_response','authorization','rate_limit','provider','validation','success')),
 created_at timestamptz not null default now()
);
create index qb_api_events_workspace_time on public.qb_api_events(workspace_id,created_at desc);
alter table public.qb_api_events enable row level security;
revoke all on public.qb_api_events from public,anon,authenticated;
grant select,insert,delete on public.qb_api_events to service_role;
commit;
