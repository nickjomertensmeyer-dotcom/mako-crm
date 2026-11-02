begin;
create table public.customer_tags (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.contacts(id) on delete cascade,
 tag text not null check(length(tag) between 1 and 32), primary key(customer_id,tag)
);
create table public.message_templates (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), subject text not null check(length(subject) between 3 and 160),
 body text not null check(length(body) between 10 and 4000), unique(workspace_id,name)
);
create table public.job_checklist (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 work_id uuid not null references public.work_items(id) on delete cascade,
 label text not null check(length(label) between 1 and 200),done boolean not null default false,created_at timestamptz not null default now()
);
create table public.customer_portals (
 customer_id uuid primary key references public.contacts(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,revoked boolean not null default false
);
create table public.invoice_schedules (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source_id uuid not null unique references public.business_documents(id),next_date date not null,anchor_day integer not null check(anchor_day between 1 and 31),
 frequency text not null check(frequency in ('Weekly','Monthly')),paused boolean not null default false,end_date date,
 created_at timestamptz not null default now(),check(end_date is null or end_date>=next_date)
);
create table public.scheduled_invoices (
 schedule_id uuid references public.invoice_schedules(id),run_date date not null,invoice_id uuid not null references public.business_documents(id),primary key(schedule_id,run_date)
);
alter table public.customer_tags enable row level security;
alter table public.message_templates enable row level security;
alter table public.job_checklist enable row level security;
alter table public.customer_portals enable row level security;
alter table public.invoice_schedules enable row level security;
alter table public.scheduled_invoices enable row level security;
revoke all on public.customer_tags,public.message_templates,public.job_checklist,public.customer_portals,public.invoice_schedules,public.scheduled_invoices from public,anon,authenticated;
grant select on public.customer_tags,public.message_templates,public.job_checklist,public.customer_portals,public.invoice_schedules,public.scheduled_invoices to authenticated;
grant all on public.customer_portals,public.invoice_schedules,public.scheduled_invoices to service_role;
create policy tags_read on public.customer_tags for select to authenticated using(public.can_work(workspace_id,'customers') or public.can_work(workspace_id,'leads'));
create policy templates_read on public.message_templates for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=message_templates.workspace_id and m.user_id=auth.uid()));
create policy checklist_read on public.job_checklist for select to authenticated using(public.can_work(workspace_id,'jobs'));
create policy portals_read on public.customer_portals for select to authenticated using(public.can_work(workspace_id,'customers'));
create policy schedules_read on public.invoice_schedules for select to authenticated using(public.can_work(workspace_id,'invoices'));
create policy runs_read on public.scheduled_invoices for select to authenticated using(exists(select 1 from public.invoice_schedules s where s.id=schedule_id and public.can_work(s.workspace_id,'invoices')));

create function public.set_customer_tags(target uuid,customer uuid,tags text[]) returns void language plpgsql security definer set search_path='' as $$
declare c public.contacts;t text;
begin
 select * into c from public.contacts where id=customer and workspace_id=target;
 if c.id is null then raise exception 'Customer unavailable';end if;
 perform public.require_business_tool(target,case when c.stage='Lead' then 'leads' else 'customers' end);
 if tags is null or cardinality(tags)>20 then raise exception 'Use up to 20 tags';end if;
 foreach t in array tags loop if t is null or length(trim(t)) not between 1 and 32 then raise exception 'Use tags of 1–32 characters';end if;end loop;
 delete from public.customer_tags where customer_id=customer and workspace_id=target;
 insert into public.customer_tags(workspace_id,customer_id,tag) select target,customer,lower(trim(x)) from unnest(tags) x on conflict do nothing;
end $$;
create function public.save_message_template(target uuid,item uuid,title text,email_subject text,email_body text,remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_pro(target);
 if item is not null and not exists(select 1 from public.message_templates where id=item and workspace_id=target) then raise exception 'Template unavailable';end if;
 if remove then delete from public.message_templates where id=item and workspace_id=target;return item;end if;
 if item is null then
 if (select count(*) from public.message_templates where workspace_id=target)>=100 then raise exception 'Use up to 100 templates';end if;
 insert into public.message_templates(workspace_id,name,subject,body) values(target,trim(title),trim(email_subject),email_body) returning id into result;
 else update public.message_templates set name=trim(title),subject=trim(email_subject),body=email_body where id=item and workspace_id=target returning id into result;end if;
 return result;
end $$;
create function public.save_job_check(target uuid,work uuid,item uuid,title text,checked boolean,remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_business_tool(target,'jobs');
 if not exists(select 1 from public.work_items where id=work and workspace_id=target and kind='Job' and archived_at is null) then raise exception 'Job unavailable';end if;
 if item is not null and not exists(select 1 from public.job_checklist where id=item and workspace_id=target and work_id=work) then raise exception 'Checklist item unavailable';end if;
 if remove then delete from public.job_checklist where id=item and workspace_id=target;return item;end if;
 if item is null then
 if (select count(*) from public.job_checklist where work_id=work)>=100 then raise exception 'Use up to 100 checklist items';end if;
 insert into public.job_checklist(workspace_id,work_id,label,done) values(target,work,trim(title),checked) returning id into result;
 else update public.job_checklist set label=trim(title),done=checked where id=item and workspace_id=target returning id into result;end if;
 return result;
end $$;
create function public.share_customer_portal(target uuid,customer uuid,secret_hash text,disable boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_business_tool(target,'customers');
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Only the workspace owner can share customer portals';end if;
 if not exists(select 1 from public.contacts where id=customer and workspace_id=target and archived_at is null) then raise exception 'Customer unavailable';end if;
 if disable then update public.customer_portals set revoked=true where customer_id=customer and workspace_id=target;return;end if;
 insert into public.customer_portals(customer_id,workspace_id,token_hash,expires_at) values(customer,target,secret_hash,now()+interval '30 days') on conflict(customer_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked=false;
end $$;
create function public.save_invoice_schedule(target uuid,source uuid,first_date date,cadence text,stop_date date,is_paused boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_business_tool(target,'invoices');
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Only the owner can schedule invoices';end if;
 if not exists(select 1 from public.business_documents d join public.contacts c on c.id=d.customer_id and c.workspace_id=d.workspace_id where d.id=source and d.workspace_id=target and d.kind='Invoice' and d.status<>'Void' and c.archived_at is null) then raise exception 'Choose an invoice with an active customer';end if;
 if first_date is null or (not is_paused and first_date<current_date) or first_date>current_date+366 or cadence is null or cadence not in ('Weekly','Monthly') then raise exception 'Choose a future date and frequency';end if;
 insert into public.invoice_schedules(workspace_id,source_id,next_date,anchor_day,frequency,paused,end_date) values(target,source,first_date,extract(day from first_date),cadence,is_paused,stop_date)
 on conflict(source_id) do update set next_date=excluded.next_date,anchor_day=excluded.anchor_day,frequency=excluded.frequency,paused=excluded.paused,end_date=excluded.end_date returning id into result;
 return result;
end $$;
create function public.run_invoice_schedules() returns integer language plpgsql security definer set search_path='' as $$
declare s public.invoice_schedules;d public.business_documents;c public.contacts;seq integer;new_id uuid;day date;n integer:=0;month_start date;
begin
 for s in select r.* from public.invoice_schedules r join public.workspaces w on w.id=r.workspace_id where not r.paused and r.next_date<=current_date and w.status='active' and w.archived_at is null and w.plan in ('pro','custom') and (w.pilot_ends_at is null or w.pilot_ends_at>now()) and 'invoices'=any(w.modules) for update of r skip locked loop
 select * into d from public.business_documents where id=s.source_id and workspace_id=s.workspace_id;
 select * into c from public.contacts where id=d.customer_id and workspace_id=s.workspace_id and archived_at is null;
 if c.id is null or d.status='Void' then update public.invoice_schedules set paused=true where id=s.id;continue;end if;
 day:=s.next_date;
 for i in 1..12 loop
 exit when day>current_date;
 if s.end_date is not null and day>s.end_date then update public.invoice_schedules set paused=true where id=s.id;exit;end if;
 if not exists(select 1 from public.scheduled_invoices where schedule_id=s.id and run_date=day) then
 perform pg_advisory_xact_lock(hashtextextended(s.workspace_id::text||'Invoice',0));
 select coalesce(max(sequence),0)+1 into seq from public.business_documents where workspace_id=s.workspace_id and kind='Invoice';
 insert into public.business_documents(workspace_id,kind,sequence,number,customer_id,customer,issuer,issued_date,due_date,items,tax_bps,subtotal_cents,tax_cents,total_cents,notes,design)
 values(s.workspace_id,'Invoice',seq,'INV-'||lpad(seq::text,6,'0'),c.id,jsonb_build_object('name',c.name,'company',c.company,'email',c.email,'phone',c.phone),d.issuer,day,day+(d.due_date-d.issued_date),d.items,d.tax_bps,d.subtotal_cents,d.tax_cents,d.total_cents,d.notes,d.design) returning id into new_id;
 insert into public.scheduled_invoices values(s.id,day,new_id);n:=n+1;
 end if;
 if s.frequency='Weekly' then day:=day+7;else month_start:=(date_trunc('month',day)+interval '1 month')::date;day:=month_start+least(s.anchor_day-1,extract(day from month_start+interval '1 month -1 day')::integer-1);end if;
 end loop;
 -- An end date can precede the next run once a schedule has completed.
 update public.invoice_schedules set next_date=case when end_date is not null and day>end_date then next_date else day end,paused=paused or (end_date is not null and day>end_date) where id=s.id;
 end loop;return n;
end $$;
revoke all on function public.set_customer_tags(uuid,uuid,text[]),public.save_message_template(uuid,uuid,text,text,text,boolean),public.save_job_check(uuid,uuid,uuid,text,boolean,boolean),public.share_customer_portal(uuid,uuid,text,boolean),public.save_invoice_schedule(uuid,uuid,date,text,date,boolean),public.run_invoice_schedules() from public;
grant execute on function public.set_customer_tags(uuid,uuid,text[]),public.save_message_template(uuid,uuid,text,text,text,boolean),public.save_job_check(uuid,uuid,uuid,text,boolean,boolean),public.share_customer_portal(uuid,uuid,text,boolean),public.save_invoice_schedule(uuid,uuid,date,text,date,boolean) to authenticated;
grant execute on function public.run_invoice_schedules() to service_role;
commit;
