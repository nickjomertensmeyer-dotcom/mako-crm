begin;
alter table public.workspaces add column billing_admin_hold boolean not null default false;
update public.workspaces set billing_admin_hold=true where status='suspended';
alter table public.workspace_billing add column subscription_id text,add column subscription_status text not null default 'none',add column cancel_at_period_end boolean not null default false,add column synced_at timestamptz,add column sync_token uuid,add column sync_until timestamptz;
create table public.billing_events(event_id text primary key,workspace_id uuid not null references public.workspaces(id),processed_at timestamptz not null default now());
alter table public.billing_events enable row level security;
revoke all on public.billing_events from public,anon,authenticated;
grant select on public.billing_events to authenticated;
create policy billing_events_admin on public.billing_events for select to authenticated using(public.is_platform_admin());
create function public.claim_billing_sync(customer text,event_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.workspace_billing;token uuid;
begin
 select * into b from public.workspace_billing where stripe_customer_id=customer for update;
 if not found then return null; end if;
 if exists(select 1 from public.billing_events where event_id=event_key) then return null; end if;
 if b.sync_until>now() then raise exception 'Billing synchronization busy'; end if;
 token=gen_random_uuid();update public.workspace_billing set sync_token=token,sync_until=now()+interval '2 minutes' where workspace_id=b.workspace_id;return token;
end $$;
create function public.apply_billing_sync(customer text,event_key text,token uuid,subscription text,new_status text,entitled boolean,cancel_end boolean) returns void language plpgsql security definer set search_path='' as $$
declare b public.workspace_billing;w public.workspaces;
begin
 select * into b from public.workspace_billing where stripe_customer_id=customer for update;
 if not found or b.sync_token is distinct from token or b.sync_until<now() then raise exception 'Invalid synchronization lease'; end if;
 select * into w from public.workspaces where id=b.workspace_id for update;
 update public.workspace_billing set subscription_id=subscription,subscription_status=new_status,cancel_at_period_end=cancel_end,synced_at=now(),sync_token=null,sync_until=null where workspace_id=b.workspace_id;
 -- Billing can never undo an administrative hold, an archive, or a Custom agreement.
 if w.archived_at is null and not w.billing_admin_hold and w.plan<>'custom' then
  update public.workspaces set plan=case when entitled or subscription is not null then 'pro' else plan end,status=case when entitled then 'active' when subscription is not null or b.subscription_id is not null then 'suspended' else status end where id=w.id;
 end if;
 insert into public.billing_events(event_id,workspace_id) values(event_key,w.id) on conflict do nothing;
end $$;
create or replace function public.provision_workspace(target uuid,new_plan text,new_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Platform administrator required'; end if;
 update public.workspaces set plan=new_plan,status=new_status,billing_admin_hold=(new_status='suspended') where id=target;
end $$;
revoke all on function public.claim_billing_sync(text,text),public.apply_billing_sync(text,text,uuid,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_billing_sync(text,text),public.apply_billing_sync(text,text,uuid,text,text,boolean,boolean) to service_role;
create or replace function public.guard_archived_workspace() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.archived_at is not null and not public.is_platform_admin() then raise exception 'Workspace is archived'; end if;
 if new.archived_at is not null and new.status<>'suspended' then raise exception 'Restore the workspace before activating access'; end if;
 if new.archived_at is not null or old.archived_at is not null then new.billing_admin_hold=true; end if;
 return new;
end $$;
commit;
