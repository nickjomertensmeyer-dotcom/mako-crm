-- Run once in the Supabase SQL editor. No service-role key belongs in the app.
begin;
create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 2 and 100),
  industry text not null default 'General business', plan text not null default 'pending' check (plan in ('pending','pro','custom')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  modules text[] not null default array['customers','tasks']::text[] check (modules <@ array['customers','leads','quotes','schedule','jobs','invoices','tasks','team']::text[]),
  created_at timestamptz not null default now()
);
create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(), primary key (workspace_id,user_id)
);
create index memberships_user on public.memberships(user_id);
create table public.contacts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(length(name) between 1 and 120), email text not null default '' check(length(email)<=254),
  phone text not null default '' check(length(phone)<=40), company text not null default '' check(length(company)<=120),
  stage text not null default 'Customer' check (stage in ('Lead','Customer')), created_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check(length(title) between 1 and 200), due_date date, completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index contacts_workspace on public.contacts(workspace_id);
create index tasks_workspace on public.tasks(workspace_id);
alter table public.platform_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.tasks enable row level security;
revoke all on public.platform_admins,public.workspaces,public.memberships,public.contacts,public.tasks from anon,authenticated;

create function public.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;
create function public.is_workspace_member(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid());
$$;
create function public.can_work(target uuid, feature text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_member(target) and exists(select 1 from public.workspaces where id=target and status='active' and (feature=any(modules) or (feature='customers' and 'leads'=any(modules))));
$$;
revoke all on function public.is_platform_admin(),public.is_workspace_member(uuid),public.can_work(uuid,text) from public;
grant execute on function public.is_platform_admin(),public.is_workspace_member(uuid),public.can_work(uuid,text) to authenticated;
grant select on public.workspaces,public.memberships to authenticated;
grant select,insert,update,delete on public.contacts,public.tasks to authenticated;
create policy workspace_read on public.workspaces for select to authenticated using (public.is_workspace_member(id) or public.is_platform_admin());
create policy membership_read on public.memberships for select to authenticated using (user_id=auth.uid() or public.is_platform_admin());
create policy contacts_read on public.contacts for select to authenticated using(public.can_work(workspace_id,'customers'));
create policy contacts_insert on public.contacts for insert to authenticated with check(public.can_work(workspace_id,'customers'));
create policy contacts_update on public.contacts for update to authenticated using(public.can_work(workspace_id,'customers')) with check(public.can_work(workspace_id,'customers'));
create policy contacts_delete on public.contacts for delete to authenticated using(public.can_work(workspace_id,'customers'));
create policy tasks_read on public.tasks for select to authenticated using(public.can_work(workspace_id,'tasks'));
create policy tasks_insert on public.tasks for insert to authenticated with check(public.can_work(workspace_id,'tasks'));
create policy tasks_update on public.tasks for update to authenticated using(public.can_work(workspace_id,'tasks')) with check(public.can_work(workspace_id,'tasks'));
create policy tasks_delete on public.tasks for delete to authenticated using(public.can_work(workspace_id,'tasks'));

create function public.create_workspace(business_name text, business_industry text, selected_modules text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- Serializes onboarding submissions by user, including double-clicks.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'Workspace already exists'; end if;
  if business_industry not in ('General business','Mobile detailing','Tree service','Cleaning','Consulting','Other') then raise exception 'Invalid business type'; end if;
  if cardinality(selected_modules) is null or cardinality(selected_modules)<1 then raise exception 'Choose at least one module'; end if;
  insert into public.workspaces(name,industry,modules) values(trim(business_name),business_industry,selected_modules) returning id into created;
  insert into public.memberships(workspace_id,user_id,role) values(created,auth.uid(),'owner');
  return created;
end $$;
create function public.configure_workspace(target uuid,business_name text,business_industry text,selected_modules text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required'; end if;
  if business_industry not in ('General business','Mobile detailing','Tree service','Cleaning','Consulting','Other') then raise exception 'Invalid business type'; end if;
  if cardinality(selected_modules) is null or cardinality(selected_modules)<1 then raise exception 'Choose at least one module'; end if;
  update public.workspaces set name=trim(business_name),industry=business_industry,modules=selected_modules where id=target;
end $$;
create function public.provision_workspace(target uuid,new_plan text,new_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator required'; end if;
  update public.workspaces set plan=new_plan,status=new_status where id=target;
end $$;
revoke all on function public.create_workspace(text,text,text[]),public.configure_workspace(uuid,text,text,text[]),public.provision_workspace(uuid,text,text) from public;
grant execute on function public.create_workspace(text,text,text[]),public.configure_workspace(uuid,text,text,text[]),public.provision_workspace(uuid,text,text) to authenticated;
commit;
