begin;
-- Additive workflow tools. Existing records and billing behavior are unchanged.
create table public.service_catalog(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), description text not null check(length(trim(description)) between 1 and 200),
 unit_cents bigint not null check(unit_cents between 0 and 100000000), archived boolean not null default false, created_at timestamptz not null default now()
);
alter table public.service_catalog enable row level security;
grant select on public.service_catalog to authenticated;
create policy catalog_read on public.service_catalog for select to authenticated using(public.can_work(workspace_id,'quotes') or public.can_work(workspace_id,'invoices'));
create function public.save_service(target uuid,item uuid,title text,details text,cents bigint,is_archived boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_pro(target);
 if not(public.can_work(target,'quotes') or public.can_work(target,'invoices')) then raise exception 'Enable quotes or invoices';end if;
 if item is null then
  if (select count(*) from public.service_catalog where workspace_id=target)>=500 then raise exception 'Catalog limit reached';end if;
  insert into public.service_catalog(workspace_id,name,description,unit_cents) values(target,trim(title),trim(details),cents) returning id into result;
 else
  update public.service_catalog set name=trim(title),description=trim(details),unit_cents=cents,archived=is_archived where id=item and workspace_id=target returning id into result;
  if result is null then raise exception 'Service unavailable';end if;
 end if;return result;
end $$;
-- High entropy bearer links: only hashes are stored. No anonymous table access.
create table public.quote_shares(
 quote_id uuid primary key references public.business_documents(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,revoked boolean not null default false,
 decided_at timestamptz,decided_by text,decision text check(decision in ('Accepted','Declined')),created_at timestamptz not null default now()
);
alter table public.quote_shares enable row level security;
revoke all on public.quote_shares from public,anon,authenticated;
grant select on public.quote_shares to authenticated;
grant all on public.quote_shares to service_role;
create policy quote_shares_read on public.quote_shares for select to authenticated using(public.can_work(workspace_id,'quotes'));
create function public.share_quote(target uuid,item uuid,secret_hash text,disable boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.business_documents;
begin
 perform public.require_business_tool(target,'quotes');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Quote' for update;
 if d.id is null then raise exception 'Quote unavailable';end if;
 if disable then update public.quote_shares set revoked=true where quote_id=item;return;end if;
 if d.status<>'Issued' or d.due_date<current_date then raise exception 'Finalize an unexpired quote before sharing';end if;
 insert into public.quote_shares(quote_id,workspace_id,token_hash,expires_at) values(item,target,secret_hash,least(now()+interval '30 days',(d.due_date+1)::timestamptz))
 on conflict(quote_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked=false,created_at=now();
end $$;
create function public.respond_to_quote(secret_hash text,answer text,signer text) returns text language plpgsql security definer set search_path='' as $$
declare s public.quote_shares;d public.business_documents;
begin
 select * into s from public.quote_shares where token_hash=secret_hash;
 if s.quote_id is null or s.revoked or s.expires_at<=now() then raise exception 'Link unavailable or expired';end if;
 select * into d from public.business_documents where id=s.quote_id for update;
 -- Re-read after obtaining document lock; share rotation/revocation uses the same lock.
 select * into s from public.quote_shares where token_hash=secret_hash;
 if s.quote_id is null or s.revoked or s.expires_at<=now() then raise exception 'Link unavailable or expired';end if;
 if not exists(select 1 from public.workspaces where id=s.workspace_id and archived_at is null and status='active' and plan in ('pro','custom') and 'quotes'=any(modules)) then raise exception 'Quote unavailable';end if;
 if s.decision is not null then return s.decision;end if;
 if answer not in ('Accepted','Declined') or coalesce(length(trim(signer)),0) not between 2 and 120 or d.status<>'Issued' or d.due_date<current_date then raise exception 'Quote cannot be changed';end if;
 update public.business_documents set status=answer where id=d.id;
 update public.quote_shares set decision=answer,decided_at=now(),decided_by=trim(signer) where quote_id=d.id;
 return answer;
end $$;
alter table public.work_items add column source_quote uuid unique references public.business_documents(id);
create function public.quote_to_job(target uuid,item uuid,work_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.business_documents;result uuid;
begin
 perform public.require_business_tool(target,'quotes');perform public.require_business_tool(target,'jobs');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Quote' for update;
 if d.id is null or d.status<>'Accepted' or work_date is null then raise exception 'Choose an accepted quote and date';end if;
 select id into result from public.work_items where source_quote=item and workspace_id=target;
 if result is not null then return result;end if;
 insert into public.work_items(workspace_id,kind,title,customer_id,scheduled_date,notes,source_quote) values(target,'Job',left('Work for '||d.number||' · '||(d.customer->>'name'),160),d.customer_id,work_date,left(d.notes,2000),item) returning id into result;
 return result;
end $$;
create table public.contact_import_batches(workspace_id uuid not null references public.workspaces(id) on delete cascade,request_id uuid not null,result jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,request_id));
alter table public.contact_import_batches enable row level security;
revoke all on public.contact_import_batches from public,anon,authenticated;
create function public.import_contact_csv(target uuid,board_name text,batch_id uuid,rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;result jsonb;added integer:=0;skipped integer:=0;key text;
begin
 if board_name not in ('customers','leads') or batch_id is null then raise exception 'Choose customers or leads';end if;
 perform public.require_business_tool(target,board_name);
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'Import 1 to 200 rows';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||'csv-import',0));
 select b.result into result from public.contact_import_batches b where workspace_id=target and request_id=batch_id;
 if result is not null then return result;end if;
 for r in select value from jsonb_array_elements(rows) loop
  for key in select jsonb_object_keys(r) loop if key not in ('name','company','email','phone','notes') then raise exception 'Unsupported import field';end if;end loop;
  if coalesce(length(trim(r->>'name')),0) not between 1 and 120 then raise exception 'Every row needs a name';end if;
  if exists(select 1 from public.contacts c where c.workspace_id=target and ((coalesce(r->>'email','')<>'' and lower(c.email)=lower(r->>'email')) or (lower(c.name)=lower(trim(r->>'name')) and coalesce(c.phone,'')=coalesce(r->>'phone','')))) then skipped:=skipped+1;
  else perform public.save_board_record(target,board_name,null,null,r);added:=added+1;end if;
 end loop;
 result:=jsonb_build_object('added',added,'skipped',skipped);
 insert into public.contact_import_batches values(target,batch_id,result,now());return result;
end $$;
alter table public.email_followups add column invoice_id uuid references public.business_documents(id),add column request_id uuid unique;
create function public.queue_invoice_reminder(target uuid,item uuid,send_at timestamptz,email_subject text,email_body text,confirmed boolean,request_uuid uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.business_documents;
begin
 perform public.require_business_tool(target,'invoices');
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Invoice' for update;
 if exists(select 1 from public.email_followups where workspace_id=target and request_id=request_uuid) then return;end if;
 if request_uuid is null or d.id is null or d.status not in ('Issued','Partial') or d.paid_cents>=d.total_cents or d.customer_id is null then raise exception 'Choose an unpaid issued invoice';end if;
 if coalesce(d.customer->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invoice needs a valid customer email';end if;
 if confirmed is distinct from true or send_at is null or send_at<=now() or send_at>now()+interval '90 days' then raise exception 'Confirm and choose a date within 90 days';end if;
 if (select count(*) from public.email_followups where invoice_id=item and status in ('Queued','Processing'))>=3 then raise exception 'At most 3 pending reminders per invoice';end if;
 perform public.reserve_feature(target,'email');
 insert into public.email_followups(workspace_id,contact_id,recipient,subject,body,scheduled_at,consent_confirmed,invoice_id,request_id)
 values(target,d.customer_id,d.customer->>'email',trim(email_subject),trim(email_body),send_at,true,item,request_uuid);
end $$;
create function public.cancel_paid_invoice_reminders() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='Invoice' and (new.status in ('Paid','Void') or new.paid_cents>=new.total_cents) then update public.email_followups set status='Cancelled' where invoice_id=new.id and status='Queued';end if;return new;
end $$;
create trigger cancel_paid_invoice_reminders after update of status,paid_cents on public.business_documents for each row execute function public.cancel_paid_invoice_reminders();
-- Claim only eligible invoices; ordinary follow-ups retain their existing behavior.
create or replace function public.claim_followups() returns setof public.email_followups language sql security definer set search_path='' as $$
 update public.email_followups set status='Processing' where id in (
 select f.id from public.email_followups f join public.workspaces w on w.id=f.workspace_id
 where f.status='Queued' and f.scheduled_at<=now() and w.archived_at is null and w.status='active' and w.plan in ('pro','custom')
 and ((f.invoice_id is null and ('customers'=any(w.modules) or 'leads'=any(w.modules))) or (f.invoice_id is not null and 'invoices'=any(w.modules) and exists(select 1 from public.business_documents d where d.id=f.invoice_id and d.workspace_id=f.workspace_id and d.status in ('Issued','Partial') and d.paid_cents<d.total_cents)))
 order by f.scheduled_at limit 20 for update of f skip locked) returning *;
$$;
revoke all on function public.save_service(uuid,uuid,text,text,bigint,boolean),public.share_quote(uuid,uuid,text,boolean),public.respond_to_quote(text,text,text),public.quote_to_job(uuid,uuid,date),public.import_contact_csv(uuid,text,uuid,jsonb),public.queue_invoice_reminder(uuid,uuid,timestamptz,text,text,boolean,uuid),public.cancel_paid_invoice_reminders() from public,anon,authenticated;
grant execute on function public.save_service(uuid,uuid,text,text,bigint,boolean),public.share_quote(uuid,uuid,text,boolean),public.quote_to_job(uuid,uuid,date),public.import_contact_csv(uuid,text,uuid,jsonb),public.queue_invoice_reminder(uuid,uuid,timestamptz,text,text,boolean,uuid) to authenticated;
grant execute on function public.respond_to_quote(text,text,text) to service_role;
commit;
