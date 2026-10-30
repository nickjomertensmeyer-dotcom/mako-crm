begin;
alter table public.work_items add column if not exists archived_at timestamptz;
create index if not exists work_items_active_schedule on public.work_items(workspace_id,scheduled_date) where archived_at is null;
create function public.set_work_item_trash(target uuid,item uuid,restore boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare work_kind text;
begin
 perform public.require_pro(target);
 select kind into work_kind from public.work_items where id=item and workspace_id=target for update;
 if work_kind is null then raise exception 'Work item not found';end if;
 perform public.require_business_tool(target,case work_kind when 'Job' then 'jobs' else 'schedule' end);
 update public.work_items set archived_at=case when restore then null else coalesce(archived_at,now()) end where id=item and workspace_id=target;
end $$;
revoke all on function public.set_work_item_trash(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_work_item_trash(uuid,uuid,boolean) to authenticated;
create or replace function public.save_work_item(target uuid,item_id uuid,item_kind text,item_title text,customer_uuid uuid,work_date date,work_time time,memo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if item_kind not in ('Job','Appointment') then raise exception 'Invalid work type';end if;
 perform public.require_business_tool(target,case item_kind when 'Job' then 'jobs' else 'schedule' end);
 if customer_uuid is not null and not exists(select 1 from public.contacts where id=customer_uuid and workspace_id=target) then raise exception 'Choose a customer from this workspace';end if;
 if item_id is null then
  insert into public.work_items(workspace_id,kind,title,customer_id,scheduled_date,scheduled_time,notes) values(target,item_kind,trim(item_title),customer_uuid,work_date,work_time,coalesce(memo,''));
 else
  update public.work_items set title=trim(item_title),customer_id=customer_uuid,scheduled_date=work_date,scheduled_time=work_time,notes=coalesce(memo,'') where id=item_id and workspace_id=target and kind=item_kind and archived_at is null;
  if not found then raise exception 'Work item not found';end if;
 end if;
end $$;

create or replace function public.change_work_status(target uuid,item uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare k text;
begin
 select kind into k from public.work_items where id=item and workspace_id=target and archived_at is null;
 if k is null then raise exception 'Work item not found';end if;
 perform public.require_business_tool(target,case k when 'Job' then 'jobs' else 'schedule' end);
 update public.work_items set status=new_status where id=item and workspace_id=target and archived_at is null;
end $$;

create or replace function public.workspace_business_summary(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'invoice_balance',coalesce((select sum(total_cents-paid_cents) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial')),0),
 'overdue',coalesce((select sum(total_cents-paid_cents) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial') and due_date<current_date),0),
 'paid_total',coalesce((select sum(amount_cents) from public.invoice_payments where workspace_id=target),0),
 'open_quotes',(select count(*) from public.business_documents where workspace_id=target and kind='Quote' and status='Issued'),
 'upcoming_work',(select count(*) from public.work_items where workspace_id=target and archived_at is null and scheduled_date>=current_date and status in ('Planned','In progress')),
 'contact_customers',(select count(*) from public.contacts where workspace_id=target and stage='Customer'),
 'contact_leads',(select count(*) from public.contacts where workspace_id=target and stage='Lead'),
 'open_tasks',(select count(*) from public.tasks where workspace_id=target and not completed)
 );
$$;

create or replace function public.workspace_board_report(target uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 select jsonb_build_object(
  'today',current_date,
  'metrics',jsonb_build_object(
   'customers',(select count(*) from public.contacts where workspace_id=target and archived_at is null and stage='Customer'),
   'leads',(select count(*) from public.contacts where workspace_id=target and archived_at is null and stage='Lead' and pipeline_stage<>'Won'),
   'pipeline',(select coalesce(sum(estimated_value),0) from public.contacts where workspace_id=target and archived_at is null and stage='Lead' and pipeline_stage<>'Won'),
   'incomplete',(select count(*) from public.tasks where workspace_id=target and archived_at is null and not completed),
   'overdue',(select count(*) from public.tasks where workspace_id=target and archived_at is null and not completed and due_date<current_date),
   'followups',(select count(*) from public.contacts where workspace_id=target and archived_at is null and followup_date=current_date),
   'balance',(select coalesce(sum(total_cents-paid_cents),0) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial'))
  ),
  'statuses',coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.tasks where workspace_id=target and archived_at is null group by status) s),'{}'::jsonb),
  'workloads',coalesce((select jsonb_object_agg(owner,total) from (select coalesce(owner_id::text,'unassigned') owner,count(*) total from public.tasks where workspace_id=target and archived_at is null and not completed group by owner_id) s),'{}'::jsonb),
  'pipeline',coalesce((select jsonb_object_agg(pipeline_stage,jsonb_build_object('count',total,'value',value)) from (select pipeline_stage,count(*) total,sum(estimated_value) value from public.contacts where workspace_id=target and archived_at is null and stage='Lead' group by pipeline_stage) s),'{}'::jsonb),
  'payment_days',coalesce((select jsonb_agg(s order by payment_date) from (select payment_date,sum(amount_cents) amount_cents from public.invoice_payments where workspace_id=target group by payment_date) s),'[]'::jsonb),
  'upcoming',coalesce((select jsonb_agg(s) from (select id,kind,title,status,customer_id,scheduled_date from public.work_items where workspace_id=target and archived_at is null and scheduled_date>=current_date and status not in ('Completed','Cancelled') order by scheduled_date,scheduled_time nulls last,id limit 8) s),'[]'::jsonb)
 ) into result;
 return result;
end $$;

commit;
