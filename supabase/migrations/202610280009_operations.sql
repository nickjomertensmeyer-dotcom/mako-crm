-- Additive operations workspace. Apply after 008; no existing records are rewritten.
begin;
alter table public.workspaces drop constraint workspaces_modules_check;
alter table public.workspaces add constraint workspaces_modules_check check(modules <@ array['customers','leads','quotes','schedule','jobs','invoices','tasks','team','assets','recurring','booking','projects','inventory']::text[]);
create table public.operation_records (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),kind text not null check(kind in ('asset','plan','slot','project','milestone','time','expense','product','supplier','purchase')),
 title text not null check(length(trim(title)) between 1 and 160),customer_id uuid references public.contacts(id),work_id uuid references public.work_items(id),
 status text not null default 'Active' check(status in ('Active','Paused','Done','Published')),notes text not null default '' check(length(notes)<=2000),details jsonb not null default '{}',
 version integer not null default 1,archived boolean not null default false,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create index operation_workspace on public.operation_records(workspace_id,kind,created_at);
create table public.stock_movements(id uuid primary key,workspace_id uuid not null references public.workspaces(id),product_id uuid not null references public.operation_records(id),quantity numeric(14,2) not null check(quantity<>0),reason text not null check(length(reason) between 1 and 300),created_at timestamptz not null default now());
create table public.booking_requests(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,slot_id uuid not null references public.operation_records(id),name text not null,email text not null,work_id uuid references public.work_items(id),cancel_token uuid not null default gen_random_uuid(),cancelled boolean not null default false,created_at timestamptz not null default now());
create unique index booking_one_active on public.booking_requests(slot_id) where not cancelled;
create table public.plan_visits(plan_id uuid references public.operation_records(id),visit_date date,work_id uuid references public.work_items(id),primary key(plan_id,visit_date));
create function public.operation_module(k text) returns text language sql immutable set search_path='' as $$ select case when k='asset' then 'assets' when k='plan' then 'recurring' when k='slot' then 'booking' when k in ('project','milestone','time','expense') then 'projects' else 'inventory' end $$;
revoke all on function public.operation_module(text) from public;grant execute on function public.operation_module(text) to authenticated;
alter table public.operation_records enable row level security;alter table public.stock_movements enable row level security;alter table public.booking_requests enable row level security;alter table public.plan_visits enable row level security;
revoke all on public.operation_records,public.stock_movements,public.booking_requests,public.plan_visits from public,anon,authenticated;
grant select on public.operation_records,public.stock_movements,public.booking_requests,public.plan_visits to authenticated;
create policy operations_read on public.operation_records for select to authenticated using(public.can_work(workspace_id,public.operation_module(kind)));
create policy stock_read on public.stock_movements for select to authenticated using(public.can_work(workspace_id,'inventory'));
create policy bookings_read on public.booking_requests for select to authenticated using(public.can_work(workspace_id,'booking'));
create policy visits_read on public.plan_visits for select to authenticated using(exists(select 1 from public.operation_records r where r.id=plan_id));
create function public.save_operation(target uuid,record_id uuid,expected_version integer,k text,label text,customer uuid,work uuid,state text,memo text,payload jsonb,is_archived boolean) returns public.operation_records language plpgsql security definer set search_path='' as $$
declare config jsonb:='{"asset":{"module":"assets","label":"Service asset","fields":[{"key":"category","label":"Type","options":["Vehicle","Property","Equipment","Pet"]},{"key":"identifier","label":"Registration / address / serial / breed"},{"key":"details","label":"Service details","type":"textarea"},{"key":"make_model","label":"Make and model","when":"Vehicle"},{"key":"year","label":"Model year","type":"number","when":"Vehicle"},{"key":"odometer","label":"Odometer","type":"number","when":"Vehicle"},{"key":"area","label":"Area / lot size","when":"Property"},{"key":"access","label":"Access instructions","when":"Property"},{"key":"model","label":"Equipment model","when":"Equipment"},{"key":"care","label":"Pet care instructions","type":"textarea","when":"Pet"}]},"plan":{"module":"recurring","label":"Service plan","fields":[{"key":"next_date","label":"Next visit","type":"date","required":true},{"key":"frequency","label":"Repeat","options":["Weekly","Monthly"]},{"key":"timezone","label":"IANA time zone","required":true},{"key":"asset","label":"Service asset","related":"asset"},{"key":"renewal","label":"Renewal date","type":"date"}]},"slot":{"module":"booking","label":"Bookable appointment","fields":[{"key":"starts_at","label":"Start (with time zone)","type":"datetime-local","required":true},{"key":"minutes","label":"Duration (minutes)","type":"number","required":true}]},"project":{"module":"projects","label":"Project","fields":[{"key":"budget","label":"Cost budget (USD)","type":"number"},{"key":"due","label":"Due date","type":"date"}]},"milestone":{"module":"projects","label":"Milestone","fields":[{"key":"project","label":"Project","related":"project","required":true},{"key":"due","label":"Due date","type":"date"}]},"time":{"module":"projects","label":"Time entry","fields":[{"key":"project","label":"Project","related":"project","required":true},{"key":"minutes","label":"Minutes worked","type":"number","required":true},{"key":"rate","label":"Internal hourly cost (USD)","type":"number"},{"key":"date","label":"Work date","type":"date","required":true}]},"expense":{"module":"projects","label":"Expense","fields":[{"key":"project","label":"Project","related":"project","required":true},{"key":"amount","label":"Cost (USD)","type":"number","required":true},{"key":"date","label":"Expense date","type":"date","required":true}]},"product":{"module":"inventory","label":"Inventory item","fields":[{"key":"sku","label":"SKU","required":true},{"key":"unit","label":"Unit","required":true},{"key":"minimum","label":"Low-stock threshold","type":"number"}]},"supplier":{"module":"inventory","label":"Supplier","fields":[{"key":"email","label":"Email","type":"email"},{"key":"phone","label":"Phone"}]},"purchase":{"module":"inventory","label":"Purchase order","fields":[{"key":"supplier","label":"Supplier","related":"supplier","required":true},{"key":"product","label":"Item","related":"product","required":true},{"key":"quantity","label":"Quantity","type":"number","required":true},{"key":"amount","label":"Order cost (USD)","type":"number"},{"key":"due","label":"Expected date","type":"date"}]}}'; f jsonb; v text; ref public.operation_records; result public.operation_records; current_record public.operation_records;
begin
 if not config ? k then raise exception 'Unknown record type';end if;
 perform public.require_business_tool(target,public.operation_module(k));
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>12000 then raise exception 'Invalid fields';end if;
 if customer is not null and not exists(select 1 from public.contacts where id=customer and workspace_id=target) then raise exception 'Customer is outside workspace';end if;
 if work is not null and not exists(select 1 from public.work_items where id=work and workspace_id=target) then raise exception 'Work is outside workspace';end if;
 if state is null or state not in ('Active','Paused','Done','Published') or (state='Published' and k<>'slot') then raise exception 'Invalid state';end if;
 if k='slot' and not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required to manage public availability';end if;
 for f in select value from jsonb_array_elements(config->k->'fields') loop
  v:=coalesce(payload->>(f->>'key'),'');
  if (coalesce((f->>'required')::boolean,false) and v='') or length(v)>1000 then raise exception 'Check %',f->>'label';end if;
  if v<>'' and f ? 'options' and not (f->'options') ? v then raise exception 'Invalid choice';end if;
  if v<>'' and f->>'type'='number' then if v !~ '^[0-9]+(\.[0-9]{1,2})?$' or v::numeric>10000000 then raise exception 'Invalid number';end if;end if;
  if v<>'' and f->>'type'='date' then perform v::date;end if;
  if v<>'' and f ? 'related' then select * into ref from public.operation_records where id=v::uuid and workspace_id=target and kind=f->>'related' and not archived;if ref.id is null then raise exception 'Related record is unavailable';end if;end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(payload) key where not exists(select 1 from jsonb_array_elements(config->k->'fields') schema_field where schema_field->>'key'=key)) then raise exception 'Unknown field';end if;
 if k='plan' and not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Invalid time zone';end if;
 if k='slot' and state='Published' and not is_archived then
 perform pg_advisory_xact_lock(hashtextextended(target::text||'booking',0));
 if exists(select 1 from public.operation_records r where r.workspace_id=target and r.kind='slot' and r.status='Published' and not r.archived and r.id<>coalesce(record_id,'00000000-0000-0000-0000-000000000000') and tstzrange((r.details->>'starts_at')::timestamptz,(r.details->>'starts_at')::timestamptz+((r.details->>'minutes')||' minutes')::interval,'[)') && tstzrange((payload->>'starts_at')::timestamptz,(payload->>'starts_at')::timestamptz+((payload->>'minutes')||' minutes')::interval,'[)')) then raise exception 'This slot overlaps published availability';end if;
 end if;
 if k='slot' then perform (payload->>'starts_at')::timestamptz;if (payload->>'minutes')::numeric not between 5 and 480 then raise exception 'Duration must be 5 to 480 minutes';end if;end if;
 if k='time' and (payload->>'minutes')::numeric<=0 or k='purchase' and (payload->>'quantity')::numeric<=0 then raise exception 'Quantity must be positive';end if;
 if k='purchase' and state='Done' and (record_id is null or not exists(select 1 from public.operation_records where id=record_id and workspace_id=target and status='Done')) then raise exception 'Use Receive into stock to complete a purchase';end if;
 if record_id is null then
 insert into public.operation_records(workspace_id,kind,title,customer_id,work_id,status,notes,details,archived) values(target,k,trim(label),customer,work,state,memo,payload,is_archived) returning * into result;
 else
 select * into current_record from public.operation_records where workspace_id=target and id=record_id for update;
 if current_record.id is null or current_record.kind<>k or current_record.version<>expected_version then raise exception 'Record changed. Reload before saving';end if;
 if k='purchase' and current_record.status='Done' and (payload<>current_record.details or state<>'Done') then raise exception 'Received purchases cannot be edited';end if;
 if k='slot' and exists(select 1 from public.booking_requests where slot_id=record_id and not cancelled) and (payload<>current_record.details or is_archived or state<>'Published') then raise exception 'Cancel the booking before changing this slot';end if;
 update public.operation_records set title=trim(label),customer_id=customer,work_id=work,status=state,notes=memo,details=payload,archived=is_archived,version=version+1 where id=record_id returning * into result;
 end if;return result;
end $$;
create function public.move_stock(target uuid,item uuid,delta numeric,memo text,request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare available numeric;
begin
 perform public.require_business_tool(target,'inventory');
 perform 1 from public.operation_records where id=item and workspace_id=target and kind='product' and not archived for update;if not found then raise exception 'Item unavailable';end if;
 if exists(select 1 from public.stock_movements where id=request_id and workspace_id=target and product_id=item) then return;end if;
 if delta is null or delta=0 or abs(delta)>10000000 or delta<>round(delta,2) then raise exception 'Invalid stock adjustment';end if;
 select coalesce(sum(quantity),0) into available from public.stock_movements where product_id=item;
 if available+delta<0 then raise exception 'Not enough stock';end if;
 insert into public.stock_movements values(request_id,target,item,delta,memo,now());
end $$;
create function public.receive_purchase(target uuid,item uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.operation_records;
begin
 perform public.require_business_tool(target,'inventory');select * into p from public.operation_records where id=item and workspace_id=target and kind='purchase' and not archived for update;
 if p.id is null then raise exception 'Purchase unavailable';end if;if p.status='Done' then return;end if;if p.status<>'Active' then raise exception 'Resume the purchase before receiving';end if;
 perform public.move_stock(target,(p.details->>'product')::uuid,(p.details->>'quantity')::numeric,'Received purchase: '||p.title,p.id);
 update public.operation_records set status='Done',version=version+1 where id=item;
end $$;
create function public.public_booking_slots(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'starts_at',r.details->>'starts_at','minutes',r.details->>'minutes','business',w.name) order by r.details->>'starts_at'),'[]') from public.operation_records r join public.workspaces w on w.id=r.workspace_id where r.workspace_id=target and r.kind='slot' and r.status='Published' and not r.archived and w.status='active' and w.plan in ('pro','custom') and 'booking'=any(w.modules) and 'schedule'=any(w.modules) and (r.details->>'starts_at')::timestamptz>now() and not exists(select 1 from public.booking_requests b where b.slot_id=r.id and not b.cancelled)
 $$;
create function public.reserve_booking(slot uuid,guest text,address text,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operation_records; w uuid; b public.booking_requests;
begin
 select * into s from public.operation_records where id=slot and kind='slot' for update;
 select * into b from public.booking_requests where id=request_id and slot_id=slot;if b.id is not null then return jsonb_build_object('id',b.id,'cancel',b.cancel_token);end if;
 if s.id is null or not exists(select 1 from jsonb_array_elements(public.public_booking_slots(s.workspace_id)) e where e->>'id'=slot::text) then raise exception 'Appointment no longer available';end if;
 if length(trim(guest)) not between 1 and 120 or length(address)>254 or address !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Enter your name and email';end if;
 if (select count(*) from public.booking_requests where lower(email)=lower(address) and created_at>now()-interval '1 day')>=5 then raise exception 'Booking limit reached';end if;
 insert into public.work_items(workspace_id,kind,title,scheduled_date,scheduled_time,notes) values(s.workspace_id,'Appointment',s.title,((s.details->>'starts_at')::timestamptz at time zone 'UTC')::date,((s.details->>'starts_at')::timestamptz at time zone 'UTC')::time,'Online booking. Schedule time is UTC; guest details are in Booking.') returning id into w;
 insert into public.booking_requests(id,workspace_id,slot_id,name,email,work_id) values(request_id,s.workspace_id,slot,trim(guest),lower(trim(address)),w) returning * into b;
 return jsonb_build_object('id',b.id,'cancel',b.cancel_token);
end $$;
create function public.cancel_booking(token uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.booking_requests;
begin select * into b from public.booking_requests where cancel_token=token for update;if b.id is null then raise exception 'Booking unavailable';end if;update public.booking_requests set cancelled=true where id=b.id;update public.work_items set status='Cancelled' where id=b.work_id;end $$;
create function public.run_service_plans() returns integer language plpgsql security definer set search_path='' as $$
declare p public.operation_records;d date;w uuid;n integer:=0;step interval;
begin
 for p in select r.* from public.operation_records r join public.workspaces b on b.id=r.workspace_id where r.kind='plan' and r.status='Active' and not r.archived and b.status='active' and b.plan in ('pro','custom') and 'recurring'=any(b.modules) and 'jobs'=any(b.modules) for update of r skip locked loop
 d:=(p.details->>'next_date')::date;step:=case p.details->>'frequency' when 'Weekly' then interval '7 days' else interval '1 month' end;
 for i in 1..30 loop
 exit when d>(now() at time zone (p.details->>'timezone'))::date;
 if p.details->>'renewal'<>'' and d>(p.details->>'renewal')::date then update public.operation_records set status='Paused',version=version+1 where id=p.id;exit;end if;
 if not exists(select 1 from public.plan_visits where plan_id=p.id and visit_date=d) then
 insert into public.work_items(workspace_id,kind,title,customer_id,scheduled_date,notes) values(p.workspace_id,'Job',p.title,p.customer_id,d,'Service plan: '||p.id||'. '||p.notes) returning id into w;
 insert into public.plan_visits values(p.id,d,w);n:=n+1;end if;
 d:=(d+step)::date;
 end loop;
 update public.operation_records set details=jsonb_set(details,'{next_date}',to_jsonb(d::text)),version=version+1 where id=p.id;
 end loop;return n;
end $$;
revoke all on function public.save_operation(uuid,uuid,integer,text,text,uuid,uuid,text,text,jsonb,boolean),public.move_stock(uuid,uuid,numeric,text,uuid),public.receive_purchase(uuid,uuid),public.public_booking_slots(uuid),public.reserve_booking(uuid,text,text,uuid),public.cancel_booking(uuid),public.run_service_plans() from public;
grant execute on function public.save_operation(uuid,uuid,integer,text,text,uuid,uuid,text,text,jsonb,boolean),public.move_stock(uuid,uuid,numeric,text,uuid),public.receive_purchase(uuid,uuid) to authenticated;
grant execute on function public.public_booking_slots(uuid),public.reserve_booking(uuid,text,text,uuid),public.cancel_booking(uuid) to anon,authenticated;
grant execute on function public.run_service_plans() to service_role;
create or replace function public.backup_payload(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;table_name text;items jsonb;total bigint:=0;n bigint;
begin
 result:=jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target));
 foreach table_name in array array['contacts','tasks','email_followups','support_requests','business_documents','invoice_payments','work_items','board_settings','board_views','record_activity','record_comments','workspace_notifications','workflow_rules','workflow_runs','operation_records','stock_movements','booking_requests'] loop
  execute format('select count(*) from public.%I where workspace_id=$1',table_name) into n using target;
  total:=total+n;if total>50000 then raise exception 'Large workspace backup needs a dedicated job';end if;
  execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from public.%I t where workspace_id=$1',table_name) into items using target;
  result:=result||jsonb_build_object(case table_name when 'email_followups' then 'followups' when 'business_documents' then 'documents' when 'invoice_payments' then 'payments' else table_name end,items);
 end loop;return result;
end $$;

create unique index operation_sku on public.operation_records(workspace_id,lower(details->>'sku')) where kind='product' and not archived;
create or replace function public.export_workspace(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Workspace owner required';end if;
 return public.backup_payload(target);
end $$;
create function public.inventory_totals(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.require_business_tool(target,'inventory');return coalesce((select jsonb_object_agg(product_id,quantity) from (select product_id,sum(quantity) quantity from public.stock_movements where workspace_id=target group by product_id) t),'{}');end $$;
revoke all on function public.inventory_totals(uuid) from public;grant execute on function public.inventory_totals(uuid) to authenticated;
create function public.cancel_workspace_booking(target uuid,item uuid) returns void language plpgsql security definer set search_path='' as $$
declare token uuid;begin perform public.require_business_tool(target,'booking');select cancel_token into token from public.booking_requests where workspace_id=target and id=item;if token is null then raise exception 'Booking unavailable';end if;perform public.cancel_booking(token);end $$;
revoke all on function public.cancel_workspace_booking(uuid,uuid) from public;grant execute on function public.cancel_workspace_booking(uuid,uuid) to authenticated;
create function public.operation_reminders() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.workspace_notifications(workspace_id,user_id,message,board,event_key)
 select r.workspace_id,m.user_id,'Appointment in the next 24 hours: '||r.title,'booking','appointment:'||r.id||':'||(r.details->>'starts_at') from public.operation_records r join public.workspaces w on w.id=r.workspace_id join public.memberships m on m.workspace_id=r.workspace_id and m.role='owner' where r.kind='slot' and r.status='Published' and not r.archived and w.status='active' and 'booking'=any(w.modules) and (r.details->>'starts_at')::timestamptz between now() and now()+interval '24 hours' and exists(select 1 from public.booking_requests b where b.slot_id=r.id and not b.cancelled) on conflict do nothing;
 insert into public.workspace_notifications(workspace_id,user_id,message,board,event_key)
 select r.workspace_id,m.user_id,'Service plan renewal due: '||r.title,'recurring','renewal:'||r.id||':'||(r.details->>'renewal') from public.operation_records r join public.workspaces w on w.id=r.workspace_id join public.memberships m on m.workspace_id=r.workspace_id and m.role='owner' where r.kind='plan' and r.status='Active' and not r.archived and w.status='active' and 'recurring'=any(w.modules) and nullif(r.details->>'renewal','')::date between current_date and current_date+7 on conflict do nothing;
end $$;
revoke all on function public.operation_reminders() from public;grant execute on function public.operation_reminders() to service_role;

commit;
