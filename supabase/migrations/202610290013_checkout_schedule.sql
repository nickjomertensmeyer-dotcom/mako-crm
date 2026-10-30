begin;
alter table public.workspace_billing add column checkout_started_at timestamptz not null default now();
commit;
