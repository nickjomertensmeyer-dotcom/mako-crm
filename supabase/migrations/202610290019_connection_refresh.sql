begin;
alter table public.app_connections add column if not exists refresh_lock_token uuid,add column if not exists refresh_lock_until timestamptz;
create or replace function public.claim_connection_refresh(target uuid,member_id uuid,source_name text,claim_token uuid) returns text
language plpgsql security definer set search_path='' as $$
declare sealed text;
begin
 update public.app_connections set refresh_lock_token=claim_token,refresh_lock_until=now()+interval '1 minute'
 where workspace_id=target and user_id=member_id and provider=source_name and (refresh_lock_until is null or refresh_lock_until<=now()) returning credential into sealed;
 return sealed;
end $$;
revoke all on function public.claim_connection_refresh(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_connection_refresh(uuid,uuid,text,uuid) to service_role;
commit;
