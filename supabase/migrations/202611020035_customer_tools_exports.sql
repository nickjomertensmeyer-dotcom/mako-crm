begin;
create or replace function public.backup_payload(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;table_name text;items jsonb;total bigint:=0;n bigint;
begin
 result:=jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target));
 foreach table_name in array array['contacts','tasks','email_followups','support_requests','business_documents','invoice_payments','work_items','board_settings','board_views','record_activity','record_comments','workspace_notifications','workflow_rules','workflow_runs','operation_records','stock_movements','booking_requests','customer_tags','message_templates','job_checklist','invoice_schedules','portal_decisions','service_catalog'] loop
  execute format('select count(*) from public.%I where workspace_id=$1',table_name) into n using target;
  total:=total+n;if total>50000 then raise exception 'Large workspace backup needs a dedicated job';end if;
  execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from public.%I t where workspace_id=$1',table_name) into items using target;
  result:=result||jsonb_build_object(case table_name when 'email_followups' then 'followups' when 'business_documents' then 'documents' when 'invoice_payments' then 'payments' else table_name end,items);
 end loop;return result;
end $$;


commit;
