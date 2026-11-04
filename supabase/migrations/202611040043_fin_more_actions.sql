-- Fin: reschedule, trash/restore work, and edit/archive saved services.
-- Apply once, after 202611030042_fin_site_actions.sql.
-- Existing Fin actions are untouched: the previous function is kept as finish_fin_v2 and
-- every request for a kind this migration does not own is passed straight to it.
begin;
alter function public.finish_fin(uuid,uuid,boolean) rename to finish_fin_v2;
revoke all on function public.finish_fin_v2(uuid,uuid,boolean) from public,anon,authenticated;
create function public.finish_fin(target uuid,request_id uuid,confirm boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_requests;a jsonb;d jsonb;k text;v_result jsonb;record_id uuid;w public.work_items;s public.service_catalog;
begin
 -- Cancellation, replay of completed requests, expiry and every older action kind stay in v2.
 select * into r from public.fin_requests where id=request_id and workspace_id=target and user_id=auth.uid();
 if r.id is null or not confirm or r.state<>'prepared' or r.proposal is null
    or (r.proposal->>'kind') not in ('reschedule_work','trash_work','restore_work','update_service','archive_service') then
  return public.finish_fin_v2(target,request_id,confirm);
 end if;
 perform public.require_pro(target);
 select * into r from public.fin_requests where id=request_id and workspace_id=target and user_id=auth.uid() for update;
 if r.state<>'prepared' or r.expires_at<=now() then raise exception 'Fin preview expired. Please ask again';end if;
 if not exists(select 1 from public.fin_credit_periods where id=r.period_id and ends_at>now()) then raise exception 'Your billing period ended';end if;
 if r.credits<>1 then raise exception 'Invalid action credit cost';end if;
 a:=r.proposal;k:=a->>'kind';d:=coalesce(a->'data','{}'::jsonb);
 if k in ('reschedule_work','trash_work','restore_work') then
  select * into w from public.work_items where id=(d->>'record_id')::uuid and workspace_id=target for update;
  if w.id is null then raise exception 'Work item not found';end if;
  if k='restore_work' then
   if w.archived_at is null then raise exception 'Work changed. Please prepare a new preview';end if;
   perform public.set_work_item_trash(target,w.id,true);
  else
   if w.archived_at is not null then raise exception 'Work changed. Please prepare a new preview';end if;
   if k='trash_work' then
    perform public.set_work_item_trash(target,w.id,false);
   else
    -- Reject the change if the visit was moved by someone else since the preview was made.
    if w.scheduled_date is distinct from nullif(d->>'previous_date','')::date or w.scheduled_time is distinct from nullif(d->>'previous_time','')::time then raise exception 'Work changed. Please prepare a new preview';end if;
    perform public.save_work_item(target,w.id,w.kind,w.title,w.customer_id,(d->>'date')::date,(d->>'time')::time,coalesce(d->>'notes',w.notes));
   end if;
  end if;
  record_id:=w.id;v_result:=jsonb_build_object('view',case w.kind when 'Job' then 'jobs' else 'schedule' end);
 else
  select * into s from public.service_catalog where id=(d->>'record_id')::uuid and workspace_id=target for update;
  if s.id is null or s.archived then raise exception 'Service unavailable';end if;
  record_id:=public.save_service(target,s.id,coalesce(nullif(trim(d->>'name'),''),s.name),coalesce(d->>'description',s.description),coalesce((d->>'unit_cents')::bigint,s.unit_cents),k='archive_service');
  v_result:=jsonb_build_object('view','quotes');
 end if;
 v_result:=v_result||jsonb_build_object('id',record_id,'kind',k);
 update public.fin_requests set state='complete',result=v_result,proposal=null where id=r.id;
 return v_result;
end $$;
revoke all on function public.finish_fin(uuid,uuid,boolean) from public,anon;
grant execute on function public.finish_fin(uuid,uuid,boolean) to authenticated;
commit;
