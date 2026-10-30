begin;
create table public.qb_sync_settings(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 owner_id uuid not null references auth.users(id),realm_id text not null,environment text not null check(environment in ('sandbox','production')),
 enabled boolean not null default false,automatic boolean not null default false,create_customers boolean not null default false,service_item_id text not null,deposit_account_id text not null,
 starts_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.qb_sync_jobs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 realm_id text not null,environment text not null check(environment in ('sandbox','production')),kind text not null check(kind in ('Customer','Invoice','Payment')),
 source_id uuid not null,source_hash text not null,payload jsonb not null,request_id uuid not null default gen_random_uuid(),
 status text not null default 'Pending' check(status in ('Pending','Processing','Synced','Failed','Review')),
 remote_id text,error text not null default '',claim_token uuid,claim_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,realm_id,environment,kind,source_id)
);
alter table public.qb_sync_settings enable row level security;alter table public.qb_sync_jobs enable row level security;
revoke all on public.qb_sync_settings,public.qb_sync_jobs from public,anon,authenticated;
grant all on public.qb_sync_settings,public.qb_sync_jobs to service_role;
create table public.qb_sync_queue(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,invoice_id uuid primary key references public.business_documents(id) on delete cascade,
 version integer not null default 1,available_at timestamptz not null default now(),claim_token uuid,claim_until timestamptz,error text not null default '',attempts integer not null default 0
);
alter table public.qb_sync_queue enable row level security;revoke all on public.qb_sync_queue from public,anon,authenticated;grant all on public.qb_sync_queue to service_role;
create function public.queue_accounting_invoice() returns trigger language plpgsql security definer set search_path='' as $$
declare doc public.business_documents;setting public.qb_sync_settings;
begin
 if TG_TABLE_NAME='invoice_payments' then select * into doc from public.business_documents where id=new.invoice_id;else doc:=new;end if;
 select * into setting from public.qb_sync_settings where workspace_id=doc.workspace_id and enabled and automatic;
 if not found or doc.kind<>'Invoice' or doc.status not in ('Issued','Partial','Paid') then return new;end if;
 if doc.created_at<setting.starts_at and not exists(select 1 from public.qb_sync_jobs where workspace_id=doc.workspace_id and environment=setting.environment and realm_id=setting.realm_id and kind='Invoice' and source_id=doc.id and status='Synced') then return new;end if;
 insert into public.qb_sync_queue(workspace_id,invoice_id) values(doc.workspace_id,doc.id) on conflict(invoice_id) do update set version=qb_sync_queue.version+1,available_at=now(),error='';
 return new;
end $$;
create trigger queue_accounting_document after insert or update on public.business_documents for each row execute function public.queue_accounting_invoice();
create trigger queue_accounting_payment after insert on public.invoice_payments for each row execute function public.queue_accounting_invoice();
create function public.claim_accounting_queue() returns setof public.qb_sync_queue language sql security definer set search_path='' as $$
 with candidates as(select invoice_id from public.qb_sync_queue where available_at<=now() and (claim_until is null or claim_until<now()) order by available_at limit 10 for update skip locked)
 update public.qb_sync_queue q set claim_token=gen_random_uuid(),claim_until=now()+interval '6 minutes',attempts=attempts+1 from candidates c where q.invoice_id=c.invoice_id returning q.*;
$$;
revoke all on function public.claim_accounting_queue() from public,anon,authenticated;grant execute on function public.claim_accounting_queue() to service_role;
create function public.claim_qb_sync(job_id uuid,claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.qb_sync_jobs set status='Processing',claim_token=claim,claim_until=now()+interval '2 minutes',updated_at=now(),error=''
 where id=job_id and status in ('Pending','Failed') returning to_jsonb(qb_sync_jobs.*) into result;
 return result;
end $$;
revoke all on function public.claim_qb_sync(uuid,uuid) from public,anon,authenticated;grant execute on function public.claim_qb_sync(uuid,uuid) to service_role;
commit;
