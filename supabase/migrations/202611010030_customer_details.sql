-- Additive: preserve existing full names, IDs, relationships and permissions.
alter table public.contacts add column first_name text, add column last_name text, add column birthday date;
alter table public.contacts add constraint contact_name_parts_length check (length(first_name)<=120 and length(last_name)<=120);
alter table public.contacts add constraint contact_birthday_valid check (birthday is null or (birthday>=date '1900-01-01' and birthday<=current_date));
create or replace function public.save_board_record(target uuid,board text,item_id uuid,expected_version integer,patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;was_new boolean:=item_id is null;valid text[];k text; row_data jsonb;
begin
 if board is null or board not in ('tasks','leads','customers') then raise exception 'Invalid board';end if;
 perform public.require_business_tool(target,board);
 if jsonb_typeof(patch)<>'object' then raise exception 'Invalid record';end if;
 valid:=case when board='tasks' then array['title','due_date','status','priority','owner_id','contact_id','description','archived_at','custom_values'] else array['name','first_name','last_name','birthday','company','email','phone','pipeline_stage','owner_id','estimated_value','followup_date','notes','relationship_status','archived_at','custom_values'] end;
 for k in select jsonb_object_keys(patch) loop if not(k=any(valid)) then raise exception 'Unsupported field';end if;end loop;

 if board<>'tasks' and (patch ? 'first_name' or patch ? 'last_name') then
  if item_id is not null then
   select to_jsonb(c) into row_data from public.contacts c where id=item_id and workspace_id=target for update;
   if row_data is null then raise exception 'Record unavailable';end if;
  end if;
  patch:=jsonb_build_object('first_name',coalesce(row_data->>'first_name',row_data->>'name',''),'last_name',coalesce(row_data->>'last_name',''))||patch;
  patch:=patch||jsonb_build_object('name',trim(concat_ws(' ',nullif(trim(patch->>'first_name'),''),nullif(trim(patch->>'last_name'),''))));
  if coalesce(trim(patch->>'first_name'),'')='' or length(patch->>'name')>120 then raise exception 'Enter a valid first name and keep the full name within 120 characters.';end if;
 end if;
 if board='tasks' then
  if item_id is null then insert into public.tasks(workspace_id,title) values(target,trim(patch->>'title')) returning id into item_id;end if;
  select to_jsonb(t) into row_data from public.tasks t where id=item_id and workspace_id=target for update;
 else
  if item_id is null then
   perform pg_advisory_xact_lock(hashtextextended(target::text||lower(coalesce(patch->>'email',patch->>'name')),0));
   if coalesce(patch->>'email','')<>'' and exists(select 1 from public.contacts where workspace_id=target and archived_at is null and lower(email)=lower(patch->>'email')) then raise exception 'A contact with this email already exists. Open that record instead.';end if;
   insert into public.contacts(workspace_id,name,stage) values(target,trim(patch->>'name'),case when board='leads' then 'Lead' else 'Customer' end) returning id into item_id;
  end if;
  select to_jsonb(c) into row_data from public.contacts c where id=item_id and workspace_id=target for update;
 end if;
 if row_data is null then raise exception 'Record unavailable';end if;
 if (not was_new and expected_version is null) or (expected_version is not null and (row_data->>'version')::integer<>expected_version) then raise exception 'This record changed. Refresh before saving again.';end if;
 row_data:=row_data||patch;
 if board='tasks' then
  update public.tasks set title=trim(row_data->>'title'),due_date=nullif(row_data->>'due_date','')::date,status=row_data->>'status',priority=row_data->>'priority',owner_id=nullif(row_data->>'owner_id','')::uuid,contact_id=nullif(row_data->>'contact_id','')::uuid,description=row_data->>'description',archived_at=nullif(row_data->>'archived_at','')::timestamptz,custom_values=row_data->'custom_values' where id=item_id returning to_jsonb(tasks.*) into result;
 else
  update public.contacts set first_name=row_data->>'first_name',last_name=row_data->>'last_name',birthday=nullif(row_data->>'birthday','')::date,name=trim(row_data->>'name'),company=row_data->>'company',email=trim(row_data->>'email'),phone=row_data->>'phone',pipeline_stage=row_data->>'pipeline_stage',owner_id=nullif(row_data->>'owner_id','')::uuid,estimated_value=(row_data->>'estimated_value')::numeric,followup_date=nullif(row_data->>'followup_date','')::date,notes=row_data->>'notes',relationship_status=row_data->>'relationship_status',archived_at=nullif(row_data->>'archived_at','')::timestamptz,custom_values=row_data->'custom_values' where id=item_id returning to_jsonb(contacts.*) into result;
 end if;
 return result;
end $$;
