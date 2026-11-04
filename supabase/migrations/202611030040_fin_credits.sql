-- Included subscription allowances only. No metered billing or automatic top-ups.
begin;
create table public.fin_config(id boolean primary key default true check(id), live_mode boolean not null default true, enabled boolean not null default false, monthly_budget_cents integer not null default 500 check(monthly_budget_cents between 100 and 100000),total_budget_cents integer not null default 500 check(total_budget_cents between 100 and 100000));
insert into public.fin_config(id) values(true);
create table public.fin_credit_periods(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 is_live boolean not null,invoice_id text not null unique,subscription_id text not null,tier text not null check(tier in ('starter','pro','team')),
 starts_at timestamptz not null,ends_at timestamptz not null,allowance integer not null check(allowance in (50,250,600)),created_at timestamptz not null default now(),
 unique(workspace_id,is_live,starts_at),check(ends_at>starts_at)
);
create table public.fin_requests(
 id uuid primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id),
 period_id uuid not null references public.fin_credit_periods(id),state text not null default 'reserved' check(state in ('reserved','prepared','complete','cancelled','failed')),
 credits integer not null check(credits between 1 and 3),cost_cents integer not null default 10 check(cost_cents between 0 and 10),
 proposal jsonb,result jsonb,input_tokens integer,output_tokens integer,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes'
);
create index fin_requests_period on public.fin_requests(period_id);
create index fin_requests_budget on public.fin_requests(created_at);
alter table public.fin_config enable row level security;
alter table public.fin_credit_periods enable row level security;
alter table public.fin_requests enable row level security;
revoke all on public.fin_config,public.fin_credit_periods,public.fin_requests from public,anon,authenticated;
grant all on public.fin_config,public.fin_credit_periods,public.fin_requests to service_role;
-- Service-only grant: resolve customer ownership through the existing billing table.
create function public.grant_fin_period(customer text,subscription text,invoice text,tier_name text,period_start timestamptz,period_end timestamptz,is_live boolean) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; configured boolean; quota integer;
begin
 select live_mode into configured from public.fin_config where id;
 if configured is distinct from is_live then raise exception 'Wrong Fin billing environment';end if;
 if is_live then select workspace_id into target from public.workspace_live_billing where stripe_customer_id=customer and subscription_id=subscription;
 else select workspace_id into target from public.workspace_billing where stripe_customer_id=customer and subscription_id=subscription;end if;
 if target is null then raise exception 'Fin billing owner mismatch';end if;
 quota:=case tier_name when 'starter' then 50 when 'pro' then 250 when 'team' then 600 end;
 if quota is null or period_start>now() or period_end<=now() or period_end<=period_start or invoice!~'^in_' then raise exception 'Invalid paid credit period';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||'fin-grant',0));
 -- A second subscription or repeated event cannot reset the current allowance.
 if exists(select 1 from public.fin_credit_periods where workspace_id=target and fin_credit_periods.is_live=grant_fin_period.is_live and starts_at<period_end and ends_at>period_start) then return;end if;
 insert into public.fin_credit_periods(workspace_id,is_live,invoice_id,subscription_id,tier,starts_at,ends_at,allowance) values(target,is_live,invoice,subscription,tier_name,period_start,period_end,quota) on conflict do nothing;
end $$;
create function public.fin_balance(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fin_credit_periods; used integer; config public.fin_config;
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 select * into config from public.fin_config where id;
 select * into p from public.fin_credit_periods where workspace_id=target and is_live=config.live_mode and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
 select coalesce(sum(credits),0) into used from public.fin_requests where period_id=p.id and (state='complete' or (state in ('reserved','prepared') and expires_at>now()));
 return jsonb_build_object('enabled',config.enabled,'allowance',coalesce(p.allowance,0),'remaining',greatest(0,coalesce(p.allowance,0)-used),'resets_at',p.ends_at,'paid',p.id is not null);
end $$;
create function public.reserve_fin(target uuid,request_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare p public.fin_credit_periods; config public.fin_config; remaining integer; spent integer;
begin
 perform public.require_pro(target);
 select * into config from public.fin_config where id for update;
 if not config.enabled then raise exception 'Fin AI is not enabled yet';end if;
 update public.fin_requests set state='cancelled',proposal=null where state in ('reserved','prepared') and expires_at<=now();
 if exists(select 1 from public.fin_requests where id=request_id) then raise exception 'This request has already started';end if;
 select * into p from public.fin_credit_periods where workspace_id=target and is_live=config.live_mode and starts_at<=now() and ends_at>now() order by starts_at desc limit 1 for update;
 if p.id is null then raise exception 'AI credits activate after a successful paid subscription payment';end if;
 if exists(select 1 from public.fin_requests where workspace_id=target and user_id=auth.uid() and state in ('reserved','prepared') and expires_at>now()) then raise exception 'Finish or cancel your current Fin request first';end if;
 select p.allowance-coalesce(sum(credits),0) into remaining from public.fin_requests where period_id=p.id and (state='complete' or (state in ('reserved','prepared') and expires_at>now()));
 if remaining<1 then raise exception 'No AI credits remaining this billing period';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests where created_at>=date_trunc('month',now());
 if spent+10>config.monthly_budget_cents then raise exception 'Fin has reached its monthly spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests;
 if spent+10>config.total_budget_cents then raise exception 'Fin has reached its total test spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests where period_id=p.id;
 if spent+10>p.allowance*6 then raise exception 'This workspace has reached its AI spending limit';end if;
 insert into public.fin_requests(id,workspace_id,user_id,period_id,credits) values(request_id,target,auth.uid(),p.id,least(3,remaining));
 return least(3,remaining);
end $$;
-- Only the server can turn model output into a prepared proposal or settle provider usage.
create function public.prepare_fin(request_id uuid,action jsonb,credit_cost integer,provider_cents integer,tokens_in integer,tokens_out integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_requests;
begin
 select * into r from public.fin_requests where id=request_id for update;
 if r.state<>'reserved' or r.expires_at<=now() or credit_cost>r.credits or credit_cost<1 or provider_cents not between 0 and 10 then raise exception 'Fin request expired or credits unavailable';end if;
 update public.fin_requests set state=case when action is null then 'complete' else 'prepared' end,proposal=action,credits=credit_cost,cost_cents=provider_cents,input_tokens=tokens_in,output_tokens=tokens_out where id=r.id;
end $$;
create function public.finish_fin(target uuid,request_id uuid,confirm boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_requests; a jsonb; record_id uuid; line jsonb; saved_service public.service_catalog; document_lines jsonb:='[]'; kind text;
begin
 perform public.require_pro(target);
 select * into r from public.fin_requests where id=request_id and workspace_id=target and user_id=auth.uid() for update;
 if r.id is null then raise exception 'Fin request not found';end if;
 if r.state='complete' then return r.result;end if;
 if r.state<>'prepared' or r.expires_at<=now() then raise exception 'Fin preview expired. Please ask again';end if;
 if not confirm then update public.fin_requests set state='cancelled',proposal=null where id=r.id;return jsonb_build_object('cancelled',true);end if;
 if not exists(select 1 from public.fin_credit_periods where id=r.period_id and ends_at>now()) then raise exception 'Your billing period ended. Please ask again';end if;
 a:=r.proposal;kind:=a->>'kind';
 if a->>'contact_id' is not null and not exists(select 1 from public.contacts where id=(a->>'contact_id')::uuid and workspace_id=target and archived_at is null) then raise exception 'Customer is no longer available';end if;
 if kind='task' then
  if r.credits<>1 then raise exception 'Invalid task credit cost';end if;
  perform public.require_business_tool(target,'tasks');
  insert into public.tasks(workspace_id,title,due_date,description,contact_id) values(target,a->>'title',(a->>'date')::date,a->>'notes',(a->>'contact_id')::uuid) returning id into record_id;
 elsif kind='appointment' then
  if r.credits<>3 then raise exception 'Invalid appointment credit cost';end if;
  perform public.require_business_tool(target,'schedule');
  if a->>'date' is null or a->>'time' is null then raise exception 'Appointment date and time required';end if;
  insert into public.work_items(workspace_id,kind,title,scheduled_date,scheduled_time,customer_id,notes) values(target,'Appointment',a->>'title',(a->>'date')::date,(a->>'time')::time,(a->>'contact_id')::uuid,a->>'notes') returning id into record_id;
 elsif kind='quote' then
  if r.credits<>3 then raise exception 'Invalid estimate credit cost';end if;
  for line in select value from jsonb_array_elements(a->'lines') loop
   select * into saved_service from public.service_catalog where id=(line->>'service_id')::uuid and workspace_id=target and not archived;
   if saved_service.id is null or saved_service.unit_cents<>(line->>'unit_cents')::bigint then raise exception 'Service price changed. Please prepare a new estimate';end if;
   document_lines:=document_lines||jsonb_build_array(jsonb_build_object('description',saved_service.name,'unit_cents',saved_service.unit_cents,'quantity',line->'quantity'));
  end loop;
  record_id:=public.save_business_document(target,null,'Quote',(a->>'contact_id')::uuid,current_date,(a->>'date')::date,document_lines,0,'Fin draft: review tax and terms before issuing. '||(a->>'notes'));
 else raise exception 'Unsupported Fin action';end if;
 update public.fin_requests set state='complete',result=jsonb_build_object('id',record_id,'kind',kind),proposal=null where id=r.id returning result into a;
 return a;
end $$;
revoke all on function public.grant_fin_period(text,text,text,text,timestamptz,timestamptz,boolean),public.prepare_fin(uuid,jsonb,integer,integer,integer,integer),public.fin_balance(uuid),public.reserve_fin(uuid,uuid),public.finish_fin(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.grant_fin_period(text,text,text,text,timestamptz,timestamptz,boolean),public.prepare_fin(uuid,jsonb,integer,integer,integer,integer) to service_role;
grant execute on function public.fin_balance(uuid),public.reserve_fin(uuid,uuid),public.finish_fin(uuid,uuid,boolean) to authenticated;
commit;
