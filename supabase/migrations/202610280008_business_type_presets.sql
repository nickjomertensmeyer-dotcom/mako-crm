-- Expand supported industries without changing existing workspace data or plan access.
begin;
create or replace function public.is_supported_business_type(value text) returns boolean
language sql immutable set search_path='' as $$ select coalesce(value=any(array['General business','Mobile detailing','Tree service','Cleaning','Landscaping & lawn care','Pressure washing','Pest control','HVAC','Plumbing','Electrical','General contracting','Painting','Appliance repair','Auto repair','Consulting','Marketing & creative agency','IT services','Photography & videography','Event planning','Catering','Beauty & wellness','Personal training','Tutoring & coaching','Pet services','Real estate','Property management','Retail & wholesale','Other']::text[]),false); $$;
revoke all on function public.is_supported_business_type(text) from public;
create or replace function public.create_workspace(business_name text, business_industry text, selected_modules text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- Serializes onboarding submissions by user, including double-clicks.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'Workspace already exists'; end if;
  if business_industry is null or not public.is_supported_business_type(business_industry) then raise exception 'Invalid business type'; end if;
  if cardinality(selected_modules) is null or cardinality(selected_modules)<1 then raise exception 'Choose at least one module'; end if;
  insert into public.workspaces(name,industry,modules) values(trim(business_name),business_industry,selected_modules) returning id into created;
  insert into public.memberships(workspace_id,user_id,role) values(created,auth.uid(),'owner');
  return created;
end $$;
create or replace function public.configure_workspace(target uuid,business_name text,business_industry text,selected_modules text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required'; end if;
  if business_industry is null or not public.is_supported_business_type(business_industry) then raise exception 'Invalid business type'; end if;
  if cardinality(selected_modules) is null or cardinality(selected_modules)<1 then raise exception 'Choose at least one module'; end if;
  update public.workspaces set name=trim(business_name),industry=business_industry,modules=selected_modules where id=target;
end $$;

commit;
