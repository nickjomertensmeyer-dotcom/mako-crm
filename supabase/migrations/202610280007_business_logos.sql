begin;
alter table public.workspaces add column if not exists logo_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-logos','business-logos',false,250000,array['image/webp']) on conflict(id) do nothing;
create policy mako_business_logo_read on storage.objects for select to authenticated
using(bucket_id='business-logos' and exists(select 1 from public.memberships where workspace_id::text=split_part(name,'/',1) and user_id=auth.uid()));
create policy mako_business_logo_insert on storage.objects for insert to authenticated
with check(bucket_id='business-logos' and exists(select 1 from public.memberships where workspace_id::text=split_part(name,'/',1) and user_id=auth.uid() and role='owner'));
create policy mako_business_logo_delete on storage.objects for delete to authenticated
using(bucket_id='business-logos' and exists(select 1 from public.memberships where workspace_id::text=split_part(name,'/',1) and user_id=auth.uid() and role='owner'));
create function public.configure_workspace_branding(target uuid,business_name text,business_industry text,selected_modules text[],new_logo text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if new_logo is null or (new_logo<>'' and (split_part(new_logo,'/',1)<>target::text or new_logo !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')) then raise exception 'Invalid business logo path'; end if;
  perform public.configure_workspace(target,business_name,business_industry,selected_modules);
  update public.workspaces set logo_path=nullif(new_logo,'') where id=target;
end $$;
revoke all on function public.configure_workspace_branding(uuid,text,text,text[],text) from public;
grant execute on function public.configure_workspace_branding(uuid,text,text,text[],text) to authenticated;
commit;
