-- A single explicitly designated QA business can use paid sandbox credits. Customer billing stays live.
begin;
alter table public.fin_config add column sandbox_workspace_id uuid references public.workspaces(id);
create or replace function public.grant_fin_period(customer text,subscription text,invoice text,tier_name text,period_start timestamptz,period_end timestamptz,is_live boolean) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; configured boolean; test_workspace uuid; quota integer;
begin
 select live_mode,sandbox_workspace_id into configured,test_workspace from public.fin_config where id;
 if is_live then select workspace_id into target from public.workspace_live_billing where stripe_customer_id=customer and subscription_id=subscription;
 else select workspace_id into target from public.workspace_billing where stripe_customer_id=customer and subscription_id=subscription;end if;
 if target is null then raise exception 'Fin billing owner mismatch';end if;
 if configured is distinct from is_live and not coalesce(is_live=false and target=test_workspace,false) then raise exception 'Wrong Fin billing environment';end if;
 quota:=case tier_name when 'starter' then 50 when 'pro' then 250 when 'team' then 600 end;
 if quota is null or period_start>now() or period_end<=now() or period_end<=period_start or invoice!~'^in_' then raise exception 'Invalid paid credit period';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||'fin-grant',0));
 -- A second subscription or repeated event cannot reset the current allowance.
 if exists(select 1 from public.fin_credit_periods where workspace_id=target and fin_credit_periods.is_live=grant_fin_period.is_live and starts_at<period_end and ends_at>period_start) then return;end if;
 insert into public.fin_credit_periods(workspace_id,is_live,invoice_id,subscription_id,tier,starts_at,ends_at,allowance) values(target,is_live,invoice,subscription,tier_name,period_start,period_end,quota) on conflict do nothing;
end $$;
create or replace function public.fin_balance(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fin_credit_periods; used integer; config public.fin_config;
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 select * into config from public.fin_config where id;
 select * into p from public.fin_credit_periods where workspace_id=target and is_live=case when target=config.sandbox_workspace_id then false else config.live_mode end and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
 select coalesce(sum(credits),0) into used from public.fin_requests where period_id=p.id and (state='complete' or (state in ('reserved','prepared') and expires_at>now()));
 return jsonb_build_object('sandbox',coalesce(target=config.sandbox_workspace_id,false),'enabled',config.enabled,'allowance',coalesce(p.allowance,0),'remaining',greatest(0,coalesce(p.allowance,0)-used),'resets_at',p.ends_at,'paid',p.id is not null);
end $$;
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
 if spent+10>config.monthly_budget_cents then raise exception 'Fin has reached its monthly spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests;
 if spent+10>config.total_budget_cents then raise exception 'Fin has reached its total test spending limit. Contact Mako';end if;
 select coalesce(sum(cost_cents),0) into spent from public.fin_requests where period_id=p.id;
 if spent+10>p.allowance*6 then raise exception 'This workspace has reached its AI spending limit';end if;
 insert into public.fin_requests(id,workspace_id,user_id,period_id,credits) values(request_id,target,auth.uid(),p.id,least(3,remaining));
 return least(3,remaining);
end $$;
commit;
