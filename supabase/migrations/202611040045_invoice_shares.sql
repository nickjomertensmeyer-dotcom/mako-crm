-- Private customer links for invoices. Only a SHA-256 hash of the link secret is stored.
-- No anonymous table access: the public page reads through the service role only.
begin;
create table public.invoice_shares(
 invoice_id uuid primary key references public.business_documents(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.invoice_shares enable row level security;
revoke all on public.invoice_shares from public,anon,authenticated;
grant all on public.invoice_shares to service_role;
create function public.share_invoice(target uuid,item uuid,secret_hash text,disable boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.business_documents;
begin
 perform public.require_business_tool(target,'invoices');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Invoice' for update;
 if d.id is null then raise exception 'Invoice unavailable';end if;
 if disable then update public.invoice_shares set revoked=true where invoice_id=item;return;end if;
 if secret_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link';end if;
 if d.status not in ('Issued','Partial') or d.paid_cents>=d.total_cents then raise exception 'Finalize an unpaid invoice before sharing';end if;
 insert into public.invoice_shares(invoice_id,workspace_id,token_hash,expires_at) values(item,target,secret_hash,now()+interval '60 days')
 on conflict(invoice_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked=false,created_at=now();
end $$;
revoke all on function public.share_invoice(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.share_invoice(uuid,uuid,text,boolean) to authenticated;
commit;
