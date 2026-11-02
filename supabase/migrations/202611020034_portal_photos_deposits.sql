begin;
create table public.portal_decisions (document_id uuid primary key references public.business_documents(id),workspace_id uuid not null references public.workspaces(id),decision text not null,signer text not null,created_at timestamptz not null default now());
alter table public.portal_decisions enable row level security;
revoke all on public.portal_decisions from public,anon,authenticated;
grant select on public.portal_decisions to authenticated;
create policy decisions_read on public.portal_decisions for select to authenticated using(public.can_work(workspace_id,'quotes'));
create function public.portal_quote_decision(secret_hash text,item uuid,answer text,signer text) returns void language plpgsql security definer set search_path='' as $$
declare p public.customer_portals;d public.business_documents;
begin
 select p1.* into p from public.customer_portals p1 join public.workspaces w on w.id=p1.workspace_id join public.contacts c on c.id=p1.customer_id and c.workspace_id=w.id where p1.token_hash=secret_hash and not p1.revoked and p1.expires_at>now() and c.archived_at is null and w.archived_at is null and w.status='active' and w.plan in ('pro','custom') and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and 'quotes'=any(w.modules);
 if p.customer_id is null or answer is null or answer not in ('Accepted','Declined') or signer is null or length(trim(signer)) not between 2 and 120 then raise exception 'This link or response is unavailable';end if;
 select * into d from public.business_documents where id=item and workspace_id=p.workspace_id and customer_id=p.customer_id and kind='Quote' for update;
 if d.id is null then raise exception 'Quote unavailable';end if;
 if exists(select 1 from public.portal_decisions where document_id=d.id) then return;end if;
 if d.status<>'Issued' or d.due_date<current_date then raise exception 'Quote expired or already answered';end if;
 update public.business_documents set status=answer where id=d.id;
 insert into public.portal_decisions values(d.id,p.workspace_id,answer,trim(signer),now());
end $$;
revoke all on function public.portal_quote_decision(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.portal_quote_decision(text,uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('job-photos','job-photos',false,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create function public.job_photo_access(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_items w where w.workspace_id::text=split_part(path,'/',1) and w.id::text=split_part(path,'/',2) and w.kind='Job' and w.archived_at is null and public.can_work(w.workspace_id,'jobs'));
$$;
revoke all on function public.job_photo_access(text) from public;
grant execute on function public.job_photo_access(text) to authenticated;
create policy job_photos_read on storage.objects for select to authenticated using(bucket_id='job-photos' and public.job_photo_access(name));
create policy job_photos_upload on storage.objects for insert to authenticated with check(bucket_id='job-photos' and public.job_photo_access(name));

-- Preserve the old full-balance API; deposits use a separate service-only reservation.
create function public.reserve_invoice_deposit(target uuid,item uuid,merchant text,is_live boolean,requested_cents bigint)
returns public.invoice_checkouts language plpgsql security definer set search_path='' as $$
declare d public.business_documents;c public.invoice_checkouts;
begin
 select * into d from public.business_documents where id=item and workspace_id=target for update;
 if d.id is null or d.kind<>'Invoice' or d.status not in ('Issued','Partial') or requested_cents is null or requested_cents<50 or requested_cents>d.total_cents-d.paid_cents then raise exception 'Choose an amount from $0.50 up to the remaining balance';end if;
 if not exists(select 1 from public.workspace_stripe_connect where workspace_id=target and account_id=merchant and live=is_live and enabled) then raise exception 'Connect Stripe first';end if;
 select * into c from public.invoice_checkouts where invoice_id=item and state in ('creating','open','pending');
 if c.id is not null then
 if c.account_id<>merchant or c.live<>is_live or c.amount_cents<>requested_cents then raise exception 'Close the existing checkout before changing the amount';end if;return c;
 end if;
 insert into public.invoice_checkouts(workspace_id,invoice_id,account_id,live,amount_cents,currency) values(target,item,merchant,is_live,requested_cents,lower(d.currency)) returning * into c;
 return c;
end $$;
revoke all on function public.reserve_invoice_deposit(uuid,uuid,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.reserve_invoice_deposit(uuid,uuid,text,boolean,bigint) to service_role;
commit;
