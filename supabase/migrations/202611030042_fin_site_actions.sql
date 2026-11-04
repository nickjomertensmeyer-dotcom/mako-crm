begin;
alter function public.finish_fin(uuid,uuid,boolean) rename to finish_fin_v1;
revoke all on function public.finish_fin_v1(uuid,uuid,boolean) from public,anon,authenticated;
create function public.finish_fin(target uuid,request_id uuid,confirm boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_requests;a jsonb;d jsonb;k text;v_result jsonb;record_id uuid;row_data jsonb;patch jsonb;board text;line jsonb;service public.service_catalog;items jsonb:='[]';op public.operation_records;feature text;
begin
 perform public.require_pro(target);
 select * into r from public.fin_requests where id=request_id and workspace_id=target and user_id=auth.uid() for update;
 if r.id is null then raise exception 'Fin request not found';end if;
 if r.state='complete' then return r.result;end if;
 if r.state<>'prepared' or r.expires_at<=now() then raise exception 'Fin preview expired. Please ask again';end if;
 if not confirm then update public.fin_requests set state='cancelled',proposal=null where id=r.id;return jsonb_build_object('cancelled',true);end if;
 if not exists(select 1 from public.fin_credit_periods where id=r.period_id and ends_at>now()) then raise exception 'Your billing period ended';end if;
 a:=r.proposal;k:=a->>'kind';d:=coalesce(a->'data','{}'::jsonb);
 if k in ('task','appointment','quote') then return public.finish_fin_v1(target,request_id,confirm);end if;
 if r.credits<>(case when k in ('job','invoice','operation') then 3 else 1 end) then raise exception 'Invalid action credit cost';end if;
 if k in ('customer','lead','update_contact','update_task') then
  board:=case when k='customer' then 'customers' when k='lead' then 'leads' when k='update_task' then 'tasks' when d->>'stage'='Lead' then 'leads' else 'customers' end;
  patch:=d-array['record_id','expected_version','stage'];
  if k in ('customer','lead') then
   if exists(select 1 from public.contacts c where c.workspace_id=target and ((coalesce(d->>'email','')<>'' and lower(trim(c.email))=lower(trim(d->>'email'))) or (coalesce(d->>'phone','')<>'' and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(d->>'phone','[^0-9]','','g')) or lower(trim(c.name))=lower(trim(concat_ws(' ',d->>'first_name',d->>'last_name'))))) then raise exception 'A matching contact already exists, possibly in Trash. Review or restore it instead';end if;
  end if;
  row_data:=public.save_board_record(target,board,(d->>'record_id')::uuid,(d->>'expected_version')::integer,patch);
  record_id:=(row_data->>'id')::uuid;v_result:=jsonb_build_object('view',board);
 elsif k='preferences' then
  if exists(select 1 from jsonb_object_keys(d) key where key not in ('appearance','density','reduced_motion')) or d='{}'::jsonb then raise exception 'Invalid preferences';end if;
  if d ? 'appearance' and d->>'appearance' not in ('light','dark','system') or d ? 'density' and d->>'density' not in ('comfortable','compact') or d ? 'reduced_motion' and jsonb_typeof(d->'reduced_motion')<>'boolean' then raise exception 'Invalid preferences';end if;
  patch:='{}'::jsonb;
  if d ? 'appearance' then patch:=patch||jsonb_build_object('mako_appearance',d->'appearance');end if;
  if d ? 'density' then patch:=patch||jsonb_build_object('mako_density',d->'density');end if;
  if d ? 'reduced_motion' then patch:=patch||jsonb_build_object('mako_reduce_motion',d->'reduced_motion');end if;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||patch where id=auth.uid();
  record_id:=auth.uid();v_result:=jsonb_build_object('preferences',d);
 elsif k='navigate' then
  if d->>'view' not in ('overview','customers','leads','tasks','quotes','invoices','schedule','jobs','assets','recurring','booking','projects','inventory','team','connections','business-settings','settings','plan','support','followups','notifications') then raise exception 'Invalid page';end if;
  record_id:=r.id;v_result:=jsonb_build_object('view',d->>'view','navigate',true);
 elsif k='service' then
  record_id:=public.save_service(target,null,a->>'title',d->>'description',(d->>'unit_cents')::bigint,false);v_result:=jsonb_build_object('view','quotes');
 elsif k='job' then
  perform public.require_business_tool(target,'jobs');
  if a->>'contact_id' is not null and not exists(select 1 from public.contacts where workspace_id=target and id=(a->>'contact_id')::uuid and archived_at is null) then raise exception 'Customer unavailable';end if;
  insert into public.work_items(workspace_id,kind,title,scheduled_date,scheduled_time,customer_id,notes) values(target,'Job',a->>'title',(a->>'date')::date,(a->>'time')::time,(a->>'contact_id')::uuid,a->>'notes') returning id into record_id;v_result:=jsonb_build_object('view','jobs');
 elsif k='invoice' then
  for line in select value from jsonb_array_elements(a->'lines') loop
   select * into service from public.service_catalog where id=(line->>'service_id')::uuid and workspace_id=target and not archived;
   if service.id is null or service.unit_cents<>(line->>'unit_cents')::bigint then raise exception 'Service price changed. Please ask again';end if;
   items:=items||jsonb_build_array(jsonb_build_object('description',service.name,'unit_cents',service.unit_cents,'quantity',line->'quantity'));
  end loop;
  record_id:=public.save_business_document(target,null,'Invoice',(a->>'contact_id')::uuid,current_date,(a->>'date')::date,items,0,'Fin draft: review tax and terms before issuing. '||(a->>'notes'));v_result:=jsonb_build_object('view','invoices');
 elsif k='operation' then
  op:=public.save_operation(target,(d->>'record_id')::uuid,(d->>'expected_version')::integer,d->>'kind',a->>'title',(a->>'contact_id')::uuid,null,d->>'status',a->>'notes',d->'details',false);record_id:=op.id;
  feature:=case op.kind when 'asset' then 'assets' when 'plan' then 'recurring' when 'slot' then 'booking' when 'project' then 'projects' when 'milestone' then 'projects' when 'time' then 'projects' when 'expense' then 'projects' else 'inventory' end;
  v_result:=jsonb_build_object('view',feature);
 elsif k='work_status' then
  select to_jsonb(w) into row_data from public.work_items w where id=(d->>'record_id')::uuid and workspace_id=target and archived_at is null for update;
  if row_data is null or row_data->>'status' is distinct from d->>'previous_status' then raise exception 'Work changed. Please prepare a new preview';end if;
  perform public.change_work_status(target,(d->>'record_id')::uuid,d->>'status');record_id:=(d->>'record_id')::uuid;v_result:=jsonb_build_object('view',case row_data->>'kind' when 'Job' then 'jobs' else 'schedule' end);
 elsif k='document_status' then
  select to_jsonb(b) into row_data from public.business_documents b where id=(d->>'record_id')::uuid and workspace_id=target for update;
  if row_data is null or row_data->>'status' is distinct from d->>'previous_status' or d->>'status' not in ('Issued','Accepted','Declined') then raise exception 'Document changed or unsupported status';end if;
  perform public.change_document_status(target,(d->>'record_id')::uuid,d->>'status');record_id:=(d->>'record_id')::uuid;v_result:=jsonb_build_object('view',case row_data->>'kind' when 'Invoice' then 'invoices' else 'quotes' end);
 elsif k='checklist' then
  record_id:=public.save_job_check(target,(d->>'record_id')::uuid,null,d->>'label',false,false);v_result:=jsonb_build_object('view','jobs');
 elsif k='stock' then
  perform public.move_stock(target,(d->>'record_id')::uuid,(d->>'quantity')::numeric,d->>'reason',r.id);record_id:=(d->>'record_id')::uuid;v_result:=jsonb_build_object('view','inventory');
 else raise exception 'Unsupported Fin action';end if;
 v_result:=coalesce(v_result,'{}'::jsonb)||jsonb_build_object('id',record_id,'kind',k);
 update public.fin_requests set state='complete',result=v_result,proposal=null where id=r.id;
 return v_result;
end $$;
revoke all on function public.finish_fin(uuid,uuid,boolean) from public,anon;
grant execute on function public.finish_fin(uuid,uuid,boolean) to authenticated;
alter table public.fin_requests drop constraint fin_requests_cost_cents_check;
alter table public.fin_requests add constraint fin_requests_cost_cents_check check(cost_cents between 0 and 20);
alter table public.fin_requests alter column cost_cents set default 20;
create or replace function public.reserve_fin(target uuid,request_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare p public.fin_credit_periods; config public.fin_config; remaining integer; spent integer;
begin
 perform public.require_pro(target);
 select * into config from public.fin_config where id for update;
 if not config.enabled then raise exception 'Fin AI is not enabled yet';end if;
 update public.fin_requests set state='cancelled',proposal=null where state in ('reserved','prepared') and expires_at<=now();
 if exists(select 1 from public.fin_requests where id=request_id) then raise exception 'This request has already started';end if;
 select * into p from public.fin_credit_periods where workspace_id=target and is_live=case when target=config.sandbox_workspace_id then false else config.live_mode end and starts_at<=now() and ends_at>now() order by starts_at desc limit 1 for update;
 if p.id is null then raise exception 'AI credits activate after a successful paid subscription payment';end if;
 if exists(select 1 from public.fin_requests where workspace_id=target and user_id=auth.uid() and state in ('reserved','prepared') and expires_at>now()) then raise exception 'Finish or cancel your current Fin request first';end if;
 select p.allowance-coalesce(sum(credits),0) into remaining from public.fin_requests where period_id=p.id and (state='complete' or (state in ('reserved','prepared') and expires_at>now()));
 if remaining<1 then raise exception 'No AI credits remaining this billing period';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests where created_at>=date_trunc('month',now());
 if spent+20>config.monthly_budget_cents then raise exception 'Fin has reached its monthly spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests;
 if spent+20>config.total_budget_cents then raise exception 'Fin has reached its total test spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests where period_id=p.id;
 if spent+20>p.allowance*6 then raise exception 'This workspace has reached its AI spending limit';end if;
 insert into public.fin_requests(id,workspace_id,user_id,period_id,credits) values(request_id,target,auth.uid(),p.id,least(3,remaining));
 return least(3,remaining);
end $$;
create or replace function public.prepare_fin(request_id uuid,action jsonb,credit_cost integer,provider_cents integer,tokens_in integer,tokens_out integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_requests;
begin
 select * into r from public.fin_requests where id=request_id for update;
 if r.state<>'reserved' or r.expires_at<=now() or credit_cost>r.credits or credit_cost<1 or provider_cents not between 0 and 20 then raise exception 'Fin request expired or credits unavailable';end if;
 update public.fin_requests set state=case when action is null then 'complete' else 'prepared' end,proposal=action,credits=credit_cost,cost_cents=provider_cents,input_tokens=tokens_in,output_tokens=tokens_out where id=r.id;
end $$;
commit;
