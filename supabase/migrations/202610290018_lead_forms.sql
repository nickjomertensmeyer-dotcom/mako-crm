begin;
create table if not exists public.website_lead_forms(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 enabled boolean not null default false,title text not null default 'Get in touch' check(length(title) between 3 and 100),created_at timestamptz not null default now(),unique(workspace_id)
);
create table if not exists public.website_lead_submissions(
 id uuid primary key,form_id uuid not null references public.website_lead_forms(id) on delete cascade,address_hash text not null,created_at timestamptz not null default now()
);
create index if not exists website_lead_rate on public.website_lead_submissions(form_id,address_hash,created_at);
alter table public.website_lead_forms enable row level security;alter table public.website_lead_submissions enable row level security;
revoke all on public.website_lead_forms,public.website_lead_submissions from public,anon,authenticated;grant all on public.website_lead_forms,public.website_lead_submissions to service_role;
create or replace function public.submit_website_lead(form_uuid uuid,submission_uuid uuid,address_key text,person jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare form_row public.website_lead_forms;contact_uuid uuid;
begin
 select * into form_row from public.website_lead_forms where id=form_uuid and enabled for update;
 if not found or not exists(select 1 from public.workspaces where id=form_row.workspace_id and status='active' and plan in ('pro','custom') and 'leads'=any(modules) and (to_jsonb(workspaces)->>'archived_at') is null) then raise exception 'Form unavailable';end if;
 if length(address_key)<>64 or length(trim(coalesce(person->>'name',''))) not between 1 and 120 or coalesce(person->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(person->>'email',''))>254 or length(coalesce(person->>'message',''))>4000 then raise exception 'Invalid enquiry';end if;
 if exists(select 1 from public.website_lead_submissions where id=submission_uuid) then return;end if;
 if (select count(*) from public.website_lead_submissions where form_id=form_uuid and created_at>now()-interval '1 hour' and address_hash=address_key)>=5 or (select count(*) from public.website_lead_submissions where form_id=form_uuid and created_at>now()-interval '1 day')>=200 then raise exception 'Too many enquiries. Try later.';end if;
 perform pg_advisory_xact_lock(hashtextextended(form_row.workspace_id::text||lower(person->>'email'),0));
 select id into contact_uuid from public.contacts where workspace_id=form_row.workspace_id and lower(email)=lower(person->>'email') limit 1;
 if contact_uuid is null then insert into public.contacts(workspace_id,name,email,phone,stage,notes) values(form_row.workspace_id,trim(person->>'name'),lower(person->>'email'),left(coalesce(person->>'phone',''),40),'Lead','Website enquiry: '||coalesce(person->>'message','')) returning id into contact_uuid;
 else insert into public.record_activity(workspace_id,record_id,record_type,action,details) values(form_row.workspace_id,contact_uuid,'contacts','Website enquiry',jsonb_build_object('message',jsonb_build_object('from',null,'to',person->>'message')));end if;
 insert into public.website_lead_submissions values(submission_uuid,form_uuid,address_key,now());
end $$;
revoke all on function public.submit_website_lead(uuid,uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.submit_website_lead(uuid,uuid,text,jsonb) to service_role;
commit;
