begin;
create table public.workspace_billing(workspace_id uuid primary key references public.workspaces(id),stripe_customer_id text unique,checkout_attempt uuid not null default gen_random_uuid());
alter table public.workspace_billing enable row level security;
revoke all on public.workspace_billing from anon,authenticated;
grant select on public.workspace_billing to authenticated;
grant all on public.workspace_billing to service_role;
create policy billing_owner_read on public.workspace_billing for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.workspace_id=workspace_billing.workspace_id and m.user_id=auth.uid() and m.role='owner'));
commit;
