-- Restore archived imports without overwriting CRM details or related history.
begin;
create or replace function public.import_connected_contacts(target uuid,source_name text,people jsonb,contact_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person jsonb;found_id uuid;archived_time timestamptz;active_id uuid;restored_count integer:=0;created_count integer:=0;skipped_count integer:=0;
begin
 perform public.require_pro(target);
 if source_name not in ('google-contacts','outlook') or contact_stage not in ('Lead','Customer') or jsonb_typeof(people)<>'array' or jsonb_array_length(people)>100 then raise exception 'Invalid contact import';end if;
 perform public.require_business_tool(target,case when contact_stage='Lead' then 'leads' else 'customers' end);
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 for person in select value from jsonb_array_elements(people) loop
  if length(coalesce(person->>'externalId','')) not between 1 and 1024 or length(trim(coalesce(person->>'name',''))) not between 1 and 120 then raise exception 'Invalid contact';end if;
  select contact_id into found_id from public.contact_import_links where workspace_id=target and user_id=auth.uid() and provider=source_name and external_id=person->>'externalId';
  if found_id is null and coalesce(person->>'email','')<>'' then select id into found_id from public.contacts where workspace_id=target and lower(email)=lower(person->>'email') order by archived_at nulls first,id limit 1;end if;
  archived_time:=null;
  if found_id is not null then
   select archived_at into archived_time from public.contacts where id=found_id and workspace_id=target;
   if archived_time is not null then
    select id into active_id from public.contacts where workspace_id=target and archived_at is null and email<>'' and lower(email)=(select lower(email) from public.contacts where id=found_id) order by id limit 1;
    if active_id is not null then found_id:=active_id;archived_time:=null;end if;
   end if;
  end if;
  if found_id is null then
   insert into public.contacts(workspace_id,name,email,phone,company,stage) values(target,trim(person->>'name'),coalesce(person->>'email',''),coalesce(person->>'phone',''),coalesce(person->>'company',''),contact_stage) returning id into found_id;
   created_count:=created_count+1;
  elsif archived_time is not null then
   update public.contacts set archived_at=null,stage=contact_stage where id=found_id and workspace_id=target;
   restored_count:=restored_count+1;
  else skipped_count:=skipped_count+1;end if;
  insert into public.contact_import_links values(target,auth.uid(),source_name,person->>'externalId',found_id) on conflict (workspace_id,user_id,provider,external_id) do update set contact_id=excluded.contact_id;
 end loop;
 return jsonb_build_object('created',created_count,'skipped',skipped_count,'restored',restored_count);
end $$;
revoke all on function public.import_connected_contacts(uuid,text,jsonb,text) from public;
grant execute on function public.import_connected_contacts(uuid,text,jsonb,text) to authenticated;
commit;
