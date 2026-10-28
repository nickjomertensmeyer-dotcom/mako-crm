-- Private, per-account photos. No business records or authorization metadata change.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,250000,array['image/webp'])
on conflict(id) do nothing;
create policy mako_profile_read on storage.objects for select to authenticated
using(bucket_id='profile-photos' and split_part(name,'/',1)=auth.uid()::text);
create policy mako_profile_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and split_part(name,'/',1)=auth.uid()::text);
create policy mako_profile_delete on storage.objects for delete to authenticated
using(bucket_id='profile-photos' and split_part(name,'/',1)=auth.uid()::text);
commit;
