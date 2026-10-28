-- Apply once after migrations 001, 002, and 003. Preserves existing records.
begin;
create table public.business_documents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('Invoice','Quote')), sequence integer not null, number text not null,
 customer_id uuid references public.contacts(id) on delete set null, customer jsonb not null, issuer text not null,
 issued_date date not null, due_date date not null, currency text not null default 'USD' check(currency='USD'),
 items jsonb not null, tax_bps integer not null check(tax_bps between 0 and 10000),
 subtotal_cents bigint not null check(subtotal_cents between 1 and 100000000), tax_cents bigint not null check(tax_cents>=0),
 total_cents bigint not null check(total_cents=subtotal_cents+tax_cents), paid_cents bigint not null default 0 check(paid_cents between 0 and total_cents),
 status text not null default 'Draft' check(status in ('Draft','Issued','Partial','Paid','Accepted','Declined','Void')),
 notes text not null default '' check(length(notes)<=2000), source_quote uuid unique references public.business_documents(id),
 created_at timestamptz not null default now(), unique(workspace_id,kind,sequence), check(due_date>=issued_date)
);
create index documents_workspace on public.business_documents(workspace_id,created_at desc);
create table public.invoice_payments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 invoice_id uuid not null references public.business_documents(id), amount_cents bigint not null check(amount_cents>0),
 payment_date date not null, method text not null check(method in ('Cash','Bank transfer','Card externally','Other')),
 reference text not null default '' check(length(reference)<=200), request_id uuid not null unique,
 created_at timestamptz not null default now()
);
create index payments_invoice on public.invoice_payments(invoice_id);
create table public.work_items (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('Job','Appointment')),title text not null check(length(title) between 1 and 160),
 customer_id uuid references public.contacts(id) on delete set null,scheduled_date date not null,scheduled_time time,
 status text not null default 'Planned' check(status in ('Planned','In progress','Completed','Cancelled')),
 notes text not null default '' check(length(notes)<=2000),created_at timestamptz not null default now()
);
create index work_items_schedule on public.work_items(workspace_id,scheduled_date);
alter table public.business_documents enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.work_items enable row level security;
revoke all on public.business_documents,public.invoice_payments,public.work_items from public,anon,authenticated;
grant select on public.business_documents,public.invoice_payments,public.work_items to authenticated;
create policy documents_read on public.business_documents for select to authenticated using(public.can_work(workspace_id,case kind when 'Invoice' then 'invoices' else 'quotes' end));
create policy payments_read on public.invoice_payments for select to authenticated using(public.can_work(workspace_id,'invoices'));
create policy work_read on public.work_items for select to authenticated using(public.can_work(workspace_id,case kind when 'Job' then 'jobs' else 'schedule' end));

create function public.require_business_tool(target uuid,feature text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_pro(target);
 if not public.can_work(target,feature) then raise exception 'Enable this tool in workspace settings';end if;
end $$;

-- Totals are calculated from integer cents in PostgreSQL, never trusted from the browser.
create function public.save_business_document(target uuid,item_id uuid,document_kind text,customer_uuid uuid,document_date date,deadline date,line_items jsonb,tax_rate_bps integer,memo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.contacts; d public.business_documents; l jsonb; clean_items jsonb:='[]'; qty numeric; cents numeric; sub bigint:=0; tax bigint; seq integer; result uuid; business_name text;
begin
 if document_kind not in ('Invoice','Quote') then raise exception 'Invalid document type';end if;
 perform public.require_business_tool(target,case document_kind when 'Invoice' then 'invoices' else 'quotes' end);
 select * into c from public.contacts where id=customer_uuid and workspace_id=target;
 if c.id is null then raise exception 'Choose a customer in this workspace';end if;
 if document_date is null or deadline is null or deadline<document_date or tax_rate_bps is null or tax_rate_bps not between 0 and 10000 then raise exception 'Check dates and tax';end if;
 if jsonb_typeof(line_items) is distinct from 'array' then raise exception 'Add line items';end if;
 if jsonb_array_length(line_items) not between 1 and 30 then raise exception 'Use 1 to 30 line items';end if;
 for l in select value from jsonb_array_elements(line_items) loop
  if coalesce(length(trim(l->>'description')),0) not between 1 and 200 then raise exception 'Add a description';end if;
  if coalesce(l->>'quantity','') !~ '^[0-9]{1,5}(\.[0-9]{1,2})?$' or coalesce(l->>'unit_cents','') !~ '^[0-9]{1,9}$' then raise exception 'Invalid quantity or price';end if;
  qty:=(l->>'quantity')::numeric; cents:=(l->>'unit_cents')::numeric;
  if qty<=0 or qty>10000 or cents>100000000 then raise exception 'Quantity or price out of range';end if;
  sub:=sub+round(qty*cents)::bigint;
  clean_items:=clean_items||jsonb_build_array(jsonb_build_object('description',trim(l->>'description'),'quantity',qty,'unit_cents',cents,'total_cents',round(qty*cents)));
 end loop;
 if sub not between 1 and 100000000 then raise exception 'Total must be between $0.01 and $1,000,000 before tax';end if;
 tax:=round(sub::numeric*tax_rate_bps/10000)::bigint;
 if item_id is not null then
  select * into d from public.business_documents where id=item_id and workspace_id=target and kind=document_kind for update;
  if d.id is null or d.status<>'Draft' then raise exception 'Only drafts can be edited';end if;
  update public.business_documents set customer_id=c.id,customer=jsonb_build_object('name',c.name,'company',c.company,'email',c.email,'phone',c.phone),issued_date=document_date,due_date=deadline,items=clean_items,tax_bps=tax_rate_bps,subtotal_cents=sub,tax_cents=tax,total_cents=sub+tax,notes=coalesce(memo,'') where id=d.id;
  return d.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||document_kind,0));
 select coalesce(max(sequence),0)+1 into seq from public.business_documents where workspace_id=target and kind=document_kind;
 select name into business_name from public.workspaces where id=target;
 insert into public.business_documents(workspace_id,kind,sequence,number,customer_id,customer,issuer,issued_date,due_date,items,tax_bps,subtotal_cents,tax_cents,total_cents,notes)
 values(target,document_kind,seq,case document_kind when 'Invoice' then 'INV-' else 'QUO-' end||lpad(seq::text,6,'0'),c.id,jsonb_build_object('name',c.name,'company',c.company,'email',c.email,'phone',c.phone),business_name,document_date,deadline,clean_items,tax_rate_bps,sub,tax,sub+tax,coalesce(memo,'')) returning id into result;
 return result;
end $$;

create function public.change_document_status(target uuid,item uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare d public.business_documents;
begin
 select * into d from public.business_documents where id=item and workspace_id=target for update;
 if d.id is null then raise exception 'Document not found';end if;
 perform public.require_business_tool(target,case d.kind when 'Invoice' then 'invoices' else 'quotes' end);
 if not ((d.status='Draft' and new_status in ('Issued','Void')) or (d.status='Issued' and new_status='Void' and d.paid_cents=0) or (d.kind='Quote' and d.status='Issued' and new_status in ('Accepted','Declined'))) then raise exception 'Invalid status change';end if;
 update public.business_documents set status=new_status where id=d.id;
end $$;

-- Locks the invoice before checking the balance. A retry cannot create a second receipt.
create function public.record_invoice_payment(target uuid,item uuid,cents bigint,received_on date,payment_method text,payment_reference text,request_uuid uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.business_documents;
begin
 perform public.require_business_tool(target,'invoices');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Invoice' for update;
 if exists(select 1 from public.invoice_payments where request_id=request_uuid and workspace_id=target and invoice_id=item) then return;end if;
 if d.id is null or d.status not in ('Issued','Partial') then raise exception 'Issue the invoice before recording payment';end if;
 if cents is null or cents<=0 or cents>d.total_cents-d.paid_cents or received_on is null or received_on>current_date then raise exception 'Check amount and payment date';end if;
 insert into public.invoice_payments(workspace_id,invoice_id,amount_cents,payment_date,method,reference,request_id) values(target,item,cents,received_on,payment_method,coalesce(payment_reference,''),request_uuid);
 update public.business_documents set paid_cents=paid_cents+cents,status=case when paid_cents+cents=total_cents then 'Paid' else 'Partial' end where id=d.id;
end $$;

create function public.convert_quote_to_invoice(target uuid,item uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.business_documents; result uuid; seq integer;
begin
 perform public.require_business_tool(target,'quotes');perform public.require_business_tool(target,'invoices');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Quote' for update;
 if d.id is null or d.status<>'Accepted' then raise exception 'Accept the quote first';end if;
 select id into result from public.business_documents where source_quote=d.id and workspace_id=target;
 if result is not null then return result;end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||'Invoice',0));
 select coalesce(max(sequence),0)+1 into seq from public.business_documents where workspace_id=target and kind='Invoice';
 insert into public.business_documents(workspace_id,kind,sequence,number,customer_id,customer,issuer,issued_date,due_date,items,tax_bps,subtotal_cents,tax_cents,total_cents,notes,source_quote)
 values(target,'Invoice',seq,'INV-'||lpad(seq::text,6,'0'),d.customer_id,d.customer,d.issuer,current_date,current_date+30,d.items,d.tax_bps,d.subtotal_cents,d.tax_cents,d.total_cents,d.notes,d.id) returning id into result;
 return result;
end $$;

create function public.save_work_item(target uuid,item_id uuid,item_kind text,item_title text,customer_uuid uuid,work_date date,work_time time,memo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if item_kind not in ('Job','Appointment') then raise exception 'Invalid work type';end if;
 perform public.require_business_tool(target,case item_kind when 'Job' then 'jobs' else 'schedule' end);
 if customer_uuid is not null and not exists(select 1 from public.contacts where id=customer_uuid and workspace_id=target) then raise exception 'Choose a customer from this workspace';end if;
 if item_id is null then
  insert into public.work_items(workspace_id,kind,title,customer_id,scheduled_date,scheduled_time,notes) values(target,item_kind,trim(item_title),customer_uuid,work_date,work_time,coalesce(memo,''));
 else
  update public.work_items set title=trim(item_title),customer_id=customer_uuid,scheduled_date=work_date,scheduled_time=work_time,notes=coalesce(memo,'') where id=item_id and workspace_id=target and kind=item_kind;
  if not found then raise exception 'Work item not found';end if;
 end if;
end $$;
create function public.change_work_status(target uuid,item uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare k text;
begin
 select kind into k from public.work_items where id=item and workspace_id=target;
 if k is null then raise exception 'Work item not found';end if;
 perform public.require_business_tool(target,case k when 'Job' then 'jobs' else 'schedule' end);
 update public.work_items set status=new_status where id=item and workspace_id=target;
end $$;
revoke all on function public.require_business_tool(uuid,text),public.save_business_document(uuid,uuid,text,uuid,date,date,jsonb,integer,text),public.change_document_status(uuid,uuid,text),public.record_invoice_payment(uuid,uuid,bigint,date,text,text,uuid),public.convert_quote_to_invoice(uuid,uuid),public.save_work_item(uuid,uuid,text,text,uuid,date,time,text),public.change_work_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_business_document(uuid,uuid,text,uuid,date,date,jsonb,integer,text),public.change_document_status(uuid,uuid,text),public.record_invoice_payment(uuid,uuid,bigint,date,text,text,uuid),public.convert_quote_to_invoice(uuid,uuid),public.save_work_item(uuid,uuid,text,text,uuid,date,time,text),public.change_work_status(uuid,uuid,text) to authenticated;

-- Invoker permissions preserve RLS, including disabled-module and cross-business restrictions.
create function public.workspace_business_summary(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'invoice_balance',coalesce((select sum(total_cents-paid_cents) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial')),0),
 'overdue',coalesce((select sum(total_cents-paid_cents) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial') and due_date<current_date),0),
 'paid_total',coalesce((select sum(amount_cents) from public.invoice_payments where workspace_id=target),0),
 'open_quotes',(select count(*) from public.business_documents where workspace_id=target and kind='Quote' and status='Issued'),
 'upcoming_work',(select count(*) from public.work_items where workspace_id=target and scheduled_date>=current_date and status in ('Planned','In progress')),
 'contact_customers',(select count(*) from public.contacts where workspace_id=target and stage='Customer'),
 'contact_leads',(select count(*) from public.contacts where workspace_id=target and stage='Lead'),
 'open_tasks',(select count(*) from public.tasks where workspace_id=target and not completed)
 );
$$;
revoke all on function public.workspace_business_summary(uuid) from public,anon;
grant execute on function public.workspace_business_summary(uuid) to authenticated;

-- Keep manual exports and daily snapshots complete, including tools that are disabled later.
create or replace function public.backup_payload(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.contacts where workspace_id=target)+(select count(*) from public.tasks where workspace_id=target)+(select count(*) from public.email_followups where workspace_id=target)+(select count(*) from public.support_requests where workspace_id=target)+(select count(*) from public.business_documents where workspace_id=target)+(select count(*) from public.invoice_payments where workspace_id=target)+(select count(*) from public.work_items where workspace_id=target)>50000 then raise exception 'Large workspace export needs a dedicated job';end if;
 return jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target),'contacts',coalesce((select jsonb_agg(c) from public.contacts c where workspace_id=target),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(t) from public.tasks t where workspace_id=target),'[]'::jsonb),'followups',coalesce((select jsonb_agg(f) from public.email_followups f where workspace_id=target),'[]'::jsonb),'support_requests',coalesce((select jsonb_agg(s) from public.support_requests s where workspace_id=target),'[]'::jsonb),'documents',coalesce((select jsonb_agg(d) from public.business_documents d where workspace_id=target),'[]'::jsonb),'payments',coalesce((select jsonb_agg(p) from public.invoice_payments p where workspace_id=target),'[]'::jsonb),'work_items',coalesce((select jsonb_agg(j) from public.work_items j where workspace_id=target),'[]'::jsonb));
end $$;
create or replace function public.export_workspace(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Workspace owner required';end if;
 return public.backup_payload(target);
end $$;
commit;
