begin;
alter table public.workspaces add column billing_tier text not null default 'pro' check(billing_tier in ('starter','pro','team'));
alter table public.workspaces add column licensed_users integer not null default 5 check(licensed_users between 1 and 100);
alter table public.workspace_billing add column checkout_session_id text,add column checkout_tier text,add column checkout_users integer,add column checkout_lock uuid,add column checkout_lock_until timestamptz;
alter table public.workspace_live_billing add column checkout_session_id text,add column checkout_tier text,add column checkout_users integer,add column checkout_lock uuid,add column checkout_lock_until timestamptz;
create function public.claim_checkout_session(target uuid,is_live boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_data jsonb;lock_id uuid:=gen_random_uuid();
begin
 if is_live then
  perform 1 from public.workspace_live_billing b where b.workspace_id=target for update;
  if not found then raise exception 'Billing account unavailable';end if;
  update public.workspace_live_billing b set checkout_lock=lock_id,checkout_lock_until=now()+interval '2 minutes' where b.workspace_id=target and (b.checkout_lock is null or b.checkout_lock_until<now()) returning to_jsonb(b.*) into row_data;
 else
  perform 1 from public.workspace_billing b where b.workspace_id=target for update;
  if not found then raise exception 'Billing account unavailable';end if;
  update public.workspace_billing b set checkout_lock=lock_id,checkout_lock_until=now()+interval '2 minutes' where b.workspace_id=target and (b.checkout_lock is null or b.checkout_lock_until<now()) returning to_jsonb(b.*) into row_data;
 end if;
 if row_data is null then raise exception 'Checkout is already being prepared. Please try again.';end if;
 return row_data;
end $$;
revoke all on function public.claim_checkout_session(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_checkout_session(uuid,boolean) to service_role;
create table public.team_invitations(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 email text not null check(length(email)<=254),token_hash text unique not null check(token_hash~'^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,revoked_at timestamptz
);
alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from public,anon,authenticated;
grant select on public.team_invitations to authenticated;
grant all on public.team_invitations to service_role;
create policy team_invitation_owner_read on public.team_invitations for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=team_invitations.workspace_id and m.user_id=auth.uid() and m.role='owner'));

create function public.apply_tier_billing_sync(is_live boolean,customer text,event_key text,token uuid,subscription text,new_status text,entitled boolean,cancel_end boolean,tier text,seats integer) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tier is null or tier not in ('starter','pro','team') or seats is null or seats not between 1 and 100 then raise exception 'Invalid licensed plan';end if;
 if is_live then
  select workspace_id into target from public.workspace_live_billing where stripe_customer_id=customer and sync_token=token and sync_until>=now() for update;
  if target is null then raise exception 'Invalid synchronization lease';end if;
  perform public.apply_live_billing_sync(customer,event_key,token,subscription,new_status,entitled,cancel_end);
 else
  select workspace_id into target from public.workspace_billing where stripe_customer_id=customer and sync_token=token and sync_until>=now() for update;
  if target is null then raise exception 'Invalid synchronization lease';end if;
  perform public.apply_billing_sync(customer,event_key,token,subscription,new_status,entitled,cancel_end);
 end if;
 -- The lease, entitlement, and licensed-user update commit together. Never change Custom/admin holds.
 update public.workspaces w set billing_tier=tier,licensed_users=seats where w.id=target and w.archived_at is null and not w.billing_admin_hold and w.plan<>'custom' and subscription is not null;
end $$;
revoke all on function public.apply_tier_billing_sync(boolean,text,text,uuid,text,text,boolean,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.apply_tier_billing_sync(boolean,text,text,uuid,text,text,boolean,boolean,text,integer) to service_role;

create or replace function public.is_workspace_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspaces w join public.memberships m on m.workspace_id=w.id where w.id=target and m.user_id=auth.uid() and w.archived_at is null and (w.plan='custom' or m.role='owner' or m.user_id in(select x.user_id from public.memberships x where x.workspace_id=target order by (x.role='owner') desc,x.created_at,x.user_id limit w.licensed_users)));
$$;
create function public.team_roster(target uuid) returns table(user_id uuid,email text,role text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 return query select m.user_id,u.email::text,m.role,m.created_at from public.memberships m join auth.users u on u.id=m.user_id where m.workspace_id=target order by (m.role='owner') desc,m.created_at,m.user_id;
end $$;
create function public.create_team_invitation(target uuid,recipient text,secret_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.workspaces;created uuid;used integer;
begin
 select * into w from public.workspaces where id=target for update;
 if not exists(select 1 from public.memberships m where m.workspace_id=target and m.user_id=auth.uid() and m.role='owner') or w.status<>'active' or w.plan not in ('pro','custom') or (w.pilot_ends_at is not null and w.pilot_ends_at<=now()) or w.archived_at is not null or w.billing_admin_hold then raise exception 'Active workspace owner required';end if;
 recipient=lower(trim(recipient));
 if recipient is null or length(recipient)>254 or recipient!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or secret_hash is null or secret_hash!~'^[a-f0-9]{64}$' then raise exception 'Check the invitation email';end if;
 if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id where m.workspace_id=target and lower(u.email)=recipient) then raise exception 'This person is already a team member';end if;
 if exists(select 1 from public.team_invitations i where i.workspace_id=target and i.email=recipient and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) then raise exception 'An invitation is already pending. Revoke it before creating another.';end if;
 select (select count(*) from public.memberships m where m.workspace_id=target)+(select count(*) from public.team_invitations i where i.workspace_id=target and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) into used;
 if w.plan<>'custom' and used>=w.licensed_users then raise exception 'No available user seats. Review billing before adding users.';end if;
 insert into public.team_invitations(workspace_id,email,token_hash,created_by) values(target,recipient,secret_hash,auth.uid()) returning id into created;return created;
end $$;
create function public.accept_team_invitation(secret_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.team_invitations;w public.workspaces;email text;confirmed timestamptz;used integer;
begin
 select u.email,u.email_confirmed_at into email,confirmed from auth.users u where u.id=auth.uid();
 if email is null or confirmed is null then raise exception 'Sign in with the verified invited email';end if;
 select * into inv from public.team_invitations i where i.token_hash=secret_hash;
 if inv.id is null or inv.revoked_at is not null or inv.expires_at<=now() or inv.email<>lower(email) then raise exception 'This invitation is unavailable for this account';end if;
 select * into w from public.workspaces where id=inv.workspace_id for update;
 select * into inv from public.team_invitations i where i.id=inv.id for update;
 if inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'Invitation unavailable';end if;
 if inv.accepted_at is not null then
  if exists(select 1 from public.memberships m where m.workspace_id=w.id and m.user_id=auth.uid()) then return w.id;end if;
  raise exception 'Invitation already used';
 end if;
 if exists(select 1 from public.memberships m where m.user_id=auth.uid()) then raise exception 'This account already belongs to a workspace. Use a separate invited account.';end if;
 if w.status<>'active' or w.plan not in ('pro','custom') or (w.pilot_ends_at is not null and w.pilot_ends_at<=now()) or w.archived_at is not null or w.billing_admin_hold then raise exception 'Workspace is not active';end if;
 select count(*) into used from public.memberships m where m.workspace_id=w.id;
 if w.plan<>'custom' and used>=w.licensed_users then raise exception 'The owner must add a user seat first';end if;
 insert into public.memberships(workspace_id,user_id,role) values(w.id,auth.uid(),'member');
 update public.team_invitations set accepted_at=now() where id=inv.id;return w.id;
end $$;
create function public.revoke_team_invitation(target uuid,item uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces w where w.id=target for update;
 if not exists(select 1 from public.memberships m where m.workspace_id=target and m.user_id=auth.uid() and m.role='owner') then raise exception 'Owner access required';end if;
 update public.team_invitations set revoked_at=now() where id=item and workspace_id=target and accepted_at is null;
end $$;
create function public.remove_team_member(target uuid,member_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces w where w.id=target for update;
 if not exists(select 1 from public.memberships m where m.workspace_id=target and m.user_id=auth.uid() and m.role='owner') then raise exception 'Owner access required';end if;
 delete from public.memberships where workspace_id=target and user_id=member_id and role='member';
 -- Removing access never deletes customer records or changes the paid subscription quantity.
end $$;
revoke all on function public.team_roster(uuid),public.create_team_invitation(uuid,text,text),public.accept_team_invitation(text),public.revoke_team_invitation(uuid,uuid),public.remove_team_member(uuid,uuid) from public,anon;
grant execute on function public.team_roster(uuid),public.create_team_invitation(uuid,text,text),public.accept_team_invitation(text),public.revoke_team_invitation(uuid,uuid),public.remove_team_member(uuid,uuid) to authenticated;
commit;
