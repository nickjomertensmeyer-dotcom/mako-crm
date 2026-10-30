begin;
-- Separate merchant destinations from Mako subscription billing. Server writes only.
create table public.workspace_stripe_connect (
 workspace_id uuid not null references public.workspaces(id), live boolean not null,
 account_id text unique, attempt uuid not null default gen_random_uuid(),
 enabled boolean not null default true, created_at timestamptz not null default now(),
 primary key(workspace_id,live)
);
create table public.invoice_checkouts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 invoice_id uuid not null references public.business_documents(id), account_id text not null,
 live boolean not null, amount_cents bigint not null check(amount_cents>0), currency text not null check(currency='usd'),
 session_id text unique, checkout_url text, state text not null default 'creating'
 check(state in ('creating','open','pending','paid','expired','failed','review')),
 created_at timestamptz not null default now(), paid_at timestamptz
);
create unique index invoice_checkout_active on public.invoice_checkouts(invoice_id)
 where state in ('creating','open','pending');
alter table public.workspace_stripe_connect enable row level security;
alter table public.invoice_checkouts enable row level security;
revoke all on public.workspace_stripe_connect,public.invoice_checkouts from public,anon,authenticated;
grant all on public.workspace_stripe_connect,public.invoice_checkouts to service_role;

create function public.reserve_invoice_checkout(target uuid,item uuid,merchant text,is_live boolean)
returns public.invoice_checkouts language plpgsql security definer set search_path='' as $$
declare d public.business_documents; c public.invoice_checkouts;
begin
 select * into d from public.business_documents where id=item and workspace_id=target for update;
 if d.id is null or d.kind<>'Invoice' or d.status not in ('Issued','Partial') or d.paid_cents>=d.total_cents then raise exception 'Issue an unpaid invoice first'; end if;
 if not exists(select 1 from public.workspace_stripe_connect where workspace_id=target and account_id=merchant and live=is_live and enabled) then raise exception 'Connect Stripe first';end if;
 select * into c from public.invoice_checkouts where invoice_id=item and state in ('creating','open','pending');
 if c.id is not null then
  if c.account_id<>merchant or c.live<>is_live then raise exception 'Resolve the existing payment checkout first';end if;
  return c;
 end if;
 insert into public.invoice_checkouts(workspace_id,invoice_id,account_id,live,amount_cents,currency)
 values(target,item,merchant,is_live,d.total_cents-d.paid_cents,lower(d.currency)) returning * into c;
 return c;
end $$;

-- Prevent a manual payment or void racing a customer's open Checkout session.
create function public.guard_invoice_checkout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.paid_cents<>old.paid_cents or new.status<>old.status) and exists(select 1 from public.invoice_checkouts where invoice_id=old.id and state in ('creating','open','pending')) then
 raise exception 'Close the Stripe checkout before changing this invoice or recording a manual payment';end if;
 return new;
end $$;
create trigger invoice_checkout_guard before update on public.business_documents for each row execute function public.guard_invoice_checkout();

-- Called only after a signed event is checked against the stored session, account and amount.
create function public.settle_invoice_checkout(checkout uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.invoice_checkouts; d public.business_documents;
begin
 select * into c from public.invoice_checkouts where id=checkout;
 if c.id is null then raise exception 'Checkout not found';end if;
 select * into d from public.business_documents where id=c.invoice_id and workspace_id=c.workspace_id for update;
 select * into c from public.invoice_checkouts where id=checkout for update;
 if c.state='paid' then return 'paid';end if;
 if d.status not in ('Issued','Partial') or d.total_cents-d.paid_cents<c.amount_cents then
 update public.invoice_checkouts set state='review',paid_at=now() where id=c.id;return 'review';end if;
 update public.invoice_checkouts set state='paid',paid_at=now() where id=c.id;
 insert into public.invoice_payments(workspace_id,invoice_id,amount_cents,payment_date,method,reference,request_id)
 values(c.workspace_id,c.invoice_id,c.amount_cents,current_date,'Card externally','Stripe '||c.session_id,c.id);
 update public.business_documents set paid_cents=paid_cents+c.amount_cents,status=case when paid_cents+c.amount_cents=total_cents then 'Paid' else 'Partial' end where id=d.id;
 return 'paid';
end $$;
revoke all on function public.reserve_invoice_checkout(uuid,uuid,text,boolean),public.guard_invoice_checkout(),public.settle_invoice_checkout(uuid) from public,anon,authenticated;
grant execute on function public.reserve_invoice_checkout(uuid,uuid,text,boolean),public.settle_invoice_checkout(uuid) to service_role;
commit;
