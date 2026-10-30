begin;
create table public.billing_risk_alerts(
 id uuid primary key default gen_random_uuid(),
 event_id text not null,
 event_type text not null check(event_type in ('charge.refunded','charge.dispute.created','charge.dispute.closed','radar.early_fraud_warning.created')),
 livemode boolean not null,
 stripe_customer_id text not null,
 workspace_id uuid references public.workspaces(id) on delete set null,
 subscription_id text,
 invoice_id text,
 charge_id text not null,
 object_id text not null,
 amount bigint,
 currency text,
 summary text not null,
 occurred_at timestamptz not null,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null
);
create unique index billing_risk_event_invoice on public.billing_risk_alerts(livemode,event_id,coalesce(invoice_id,''));
create index billing_risk_unreviewed on public.billing_risk_alerts(occurred_at desc) where reviewed_at is null;
alter table public.billing_risk_alerts enable row level security;
revoke all on public.billing_risk_alerts from public,anon,authenticated;
grant select on public.billing_risk_alerts to authenticated;
grant all on public.billing_risk_alerts to service_role;
create policy billing_risk_admin_read on public.billing_risk_alerts for select to authenticated using(public.is_platform_admin());
create function public.review_billing_risk(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
 update public.billing_risk_alerts set reviewed_at=now(),reviewed_by=auth.uid() where id=target and reviewed_at is null;
end $$;
revoke all on function public.review_billing_risk(uuid) from public,anon;
grant execute on function public.review_billing_risk(uuid) to authenticated;
commit;
