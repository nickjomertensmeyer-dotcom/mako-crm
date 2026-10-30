begin;
create table if not exists public.app_connections(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('google-contacts','gmail','google-drive','outlook','quickbooks','stripe','sms')),
 credential text not null,scopes text not null default '',account_label text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(workspace_id,user_id,provider)
);
alter table public.app_connections enable row level security;
revoke all on public.app_connections from public,anon,authenticated;
grant all on public.app_connections to service_role;
create table if not exists public.contact_import_links(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,external_id text not null,contact_id uuid not null references public.contacts(id) on delete cascade,
 primary key(workspace_id,user_id,provider,external_id)
);
alter table public.contact_import_links enable row level security;
revoke all on public.contact_import_links from public,anon,authenticated;
grant all on public.contact_import_links to service_role;
create or replace function public.import_connected_contacts(target uuid,source_name text,people jsonb,contact_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person jsonb;found_id uuid;created_count integer:=0;skipped_count integer:=0;
begin
 perform public.require_pro(target);
 if source_name not in ('google-contacts','outlook') or contact_stage not in ('Lead','Customer') or jsonb_typeof(people)<>'array' or jsonb_array_length(people)>100 then raise exception 'Invalid contact import';end if;
 perform public.require_business_tool(target,case when contact_stage='Lead' then 'leads' else 'customers' end);
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 for person in select value from jsonb_array_elements(people) loop
  if length(coalesce(person->>'externalId','')) not between 1 and 1024 or length(trim(coalesce(person->>'name',''))) not between 1 and 120 then raise exception 'Invalid contact';end if;
  select contact_id into found_id from public.contact_import_links where workspace_id=target and user_id=auth.uid() and provider=source_name and external_id=person->>'externalId';
  if found_id is null and coalesce(person->>'email','')<>'' then select id into found_id from public.contacts where workspace_id=target and lower(email)=lower(person->>'email') limit 1;end if;
  if found_id is null then
   insert into public.contacts(workspace_id,name,email,phone,company,stage) values(target,trim(person->>'name'),coalesce(person->>'email',''),coalesce(person->>'phone',''),coalesce(person->>'company',''),contact_stage) returning id into found_id;
   created_count:=created_count+1;
  else skipped_count:=skipped_count+1;end if;
  insert into public.contact_import_links values(target,auth.uid(),source_name,person->>'externalId',found_id) on conflict do nothing;
 end loop;
 return jsonb_build_object('created',created_count,'skipped',skipped_count);
end $$;
revoke all on function public.import_connected_contacts(uuid,text,jsonb,text) from public;
grant execute on function public.import_connected_contacts(uuid,text,jsonb,text) to authenticated;
create table if not exists public.connected_messages(
 id uuid primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,provider text not null,subject text not null,
 status text not null check(status in ('Sending','Sent','Uncertain','Failed')),provider_id text,created_at timestamptz not null default now()
);
alter table public.connected_messages enable row level security;
revoke all on public.connected_messages from public,anon,authenticated;grant all on public.connected_messages to service_role;
create table if not exists public.connected_files(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,provider text not null,external_id text not null,name text not null,url text not null,created_at timestamptz not null default now(),unique(workspace_id,user_id,provider,external_id)
);
alter table public.connected_files enable row level security;
revoke all on public.connected_files from public,anon,authenticated;grant all on public.connected_files to service_role;
commit;
