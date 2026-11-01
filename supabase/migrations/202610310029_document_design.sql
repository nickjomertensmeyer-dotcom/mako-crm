begin;
alter table public.business_documents add column design jsonb not null default '{}'::jsonb;
create function public.save_designed_document(target uuid,item_id uuid,document_kind text,customer_uuid uuid,document_date date,deadline date,line_items jsonb,tax_rate_bps integer,memo text,presentation jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; entry record;
begin
 if presentation is null or jsonb_typeof(presentation) <> 'object' or octet_length(presentation::text)>360000 then raise exception 'Invalid document design';end if;
 for entry in select key,value from jsonb_each(presentation) loop
  if entry.key not in ('color','logo','business_address','business_email','business_phone','business_website','billing_address','service_address','reference','service_period','payment_terms','footer') or jsonb_typeof(entry.value)<>'string' then raise exception 'Invalid document field';end if;
  if entry.key not in ('logo','color') and length(presentation->>entry.key)>(case entry.key when 'business_email' then 254 when 'business_phone' then 80 when 'business_website' then 200 when 'reference' then 120 when 'service_period' then 120 when 'footer' then 300 else 500 end) then raise exception 'Document field too long';end if;
 end loop;
 if coalesce(presentation->>'color','')<>'' and (presentation->>'color') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid border color';end if;
 if coalesce(presentation->>'logo','')<>'' and (length(presentation->>'logo')>350000 or (presentation->>'logo') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$') then raise exception 'Invalid logo';end if;
 -- Existing RPC enforces membership, active access, enabled tools, draft locks and totals.
 -- Both writes share one transaction, so failed validation never leaves a partial draft.
 result:=public.save_business_document(target,item_id,document_kind,customer_uuid,document_date,deadline,line_items,tax_rate_bps,memo);
 update public.business_documents set design=presentation where workspace_id=target and id=result;
 return result;
end $$;
revoke all on function public.save_designed_document(uuid,uuid,text,uuid,date,date,jsonb,integer,text,jsonb) from public,anon;
grant execute on function public.save_designed_document(uuid,uuid,text,uuid,date,date,jsonb,integer,text,jsonb) to authenticated;
create or replace function public.convert_quote_to_invoice(target uuid,item uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.business_documents; result uuid; seq integer;
begin
 perform public.require_business_tool(target,'quotes');perform public.require_business_tool(target,'invoices');
 select * into d from public.business_documents where id=item and workspace_id=target and kind='Quote' for update;
 if d.id is null or d.status<>'Accepted' then raise exception 'Accept the quote first';end if;
 select id into result from public.business_documents where source_quote=d.id and workspace_id=target;
 if result is not null then return result;end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||'Invoice',0));
 select coalesce(max(sequence),0)+1 into seq from public.business_documents where workspace_id=target and kind='Invoice';
 insert into public.business_documents(workspace_id,kind,sequence,number,customer_id,customer,issuer,issued_date,due_date,items,tax_bps,subtotal_cents,tax_cents,total_cents,notes,source_quote,design)
 values(target,'Invoice',seq,'INV-'||lpad(seq::text,6,'0'),d.customer_id,d.customer,d.issuer,current_date,current_date+30,d.items,d.tax_bps,d.subtotal_cents,d.tax_cents,d.total_cents,d.notes,d.id,d.design) returning id into result;
 return result;
end $$;


commit;

