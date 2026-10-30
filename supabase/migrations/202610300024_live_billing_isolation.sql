begin;
-- Preserve existing sandbox customer and subscription mappings.
create table public.workspace_live_billing (like public.workspace_billing including all);
alter table public.workspace_live_billing add foreign key(workspace_id) references public.workspaces(id);
alter table public.workspace_live_billing enable row level security;
revoke all on public.workspace_live_billing from public,anon,authenticated;
grant select on public.workspace_live_billing to authenticated;
grant all on public.workspace_live_billing to service_role;
create policy live_billing_owner_read on public.workspace_live_billing for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.workspace_id=workspace_live_billing.workspace_id and m.user_id=auth.uid() and m.role='owner'));
create function public.claim_live_billing_sync(customer text,event_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.workspace_live_billing;token uuid;
begin
 select * into b from public.workspace_live_billing where stripe_customer_id=customer for update;
 if not found then return null; end if;
 if exists(select 1 from public.billing_events where event_id=event_key) then return null; end if;
 if b.sync_until>now() then raise exception 'Billing synchronization busy'; end if;
 token=gen_random_uuid();update public.workspace_live_billing set sync_token=token,sync_until=now()+interval '2 minutes' where workspace_id=b.workspace_id;return token;
end $$;
create function public.apply_live_billing_sync(customer text,event_key text,token uuid,subscription text,new_status text,entitled boolean,cancel_end boolean) returns void language plpgsql security definer set search_path='' as $$
declare b public.workspace_live_billing;w public.workspaces;
begin
 select * into b from public.workspace_live_billing where stripe_customer_id=customer for update;
 if not found or b.sync_token is distinct from token or b.sync_until<now() then raise exception 'Invalid synchronization lease'; end if;
 select * into w from public.workspaces where id=b.workspace_id for update;
 update public.workspace_live_billing set subscription_id=subscription,subscription_status=new_status,cancel_at_period_end=cancel_end,synced_at=now(),sync_token=null,sync_until=null where workspace_id=b.workspace_id;
 -- Billing can never undo an administrative hold, an archive, or a Custom agreement.
 if w.archived_at is null and not w.billing_admin_hold and w.plan<>'custom' then
  update public.workspaces set plan=case when entitled or subscription is not null then 'pro' else plan end,status=case when entitled then 'active' when subscription is not null or b.subscription_id is not null then 'suspended' else status end where id=w.id;
 end if;
 insert into public.billing_events(event_id,workspace_id) values(event_key,w.id) on conflict do nothing;
end $$;

revoke all on function public.claim_live_billing_sync(text,text),public.apply_live_billing_sync(text,text,uuid,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_live_billing_sync(text,text),public.apply_live_billing_sync(text,text,uuid,text,text,boolean,boolean) to service_role;
commit;
