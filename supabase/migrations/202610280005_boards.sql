-- Review and apply after 004. Additive migration; does not delete existing records.
begin;
alter table public.contacts add column owner_id uuid references auth.users(id), add column estimated_value numeric(14,2) not null default 0 check(estimated_value>=0), add column followup_date date, add column notes text not null default '' check(length(notes)<=10000), add column relationship_status text not null default 'Active', add column archived_at timestamptz, add column custom_values jsonb not null default '{}', add column version integer not null default 1;
alter table public.tasks add column owner_id uuid references auth.users(id), add column status text not null default 'To do' check(status in ('To do','In progress','Blocked','Done')), add column priority text not null default 'Normal' check(priority in ('Low','Normal','High','Urgent')), add column contact_id uuid references public.contacts(id), add column description text not null default '' check(length(description)<=10000), add column archived_at timestamptz, add column custom_values jsonb not null default '{}', add column version integer not null default 1;
update public.tasks set status='Done' where completed;
create index tasks_owner_due on public.tasks(workspace_id,owner_id,due_date) where archived_at is null;
create index contacts_followup on public.contacts(workspace_id,followup_date) where archived_at is null;
create table public.board_settings(workspace_id uuid references public.workspaces(id),board text check(board in ('tasks','leads','customers')),columns jsonb not null default '[]',primary key(workspace_id,board));
create table public.board_views(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),board text not null check(board in ('tasks','leads','customers')),user_id uuid references auth.users(id),name text not null check(length(name) between 1 and 80),settings jsonb not null,created_at timestamptz not null default now());
create table public.record_activity(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),record_id uuid not null,record_type text not null check(record_type in ('tasks','contacts')),actor_id uuid references auth.users(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.record_comments(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),record_id uuid not null,record_type text not null check(record_type in ('tasks','contacts')),author_id uuid not null references auth.users(id),body text not null check(length(body) between 1 and 4000),mentions uuid[] not null default '{}',created_at timestamptz not null default now());
create table public.workspace_notifications(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),user_id uuid not null references auth.users(id),message text not null,record_id uuid,board text,read_at timestamptz,event_key text not null,created_at timestamptz not null default now(),unique(workspace_id,user_id,event_key));
create table public.workflow_rules(workspace_id uuid references public.workspaces(id),rule text check(rule in ('lead_won','task_assigned','task_overdue','followup_due')),enabled boolean not null default false,primary key(workspace_id,rule));
create table public.workflow_runs(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),rule text not null,event_key text not null,status text not null default 'Completed',created_at timestamptz not null default now(),unique(workspace_id,rule,event_key));
create function public.board_member_list(target uuid) returns table(user_id uuid,label text,role text) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 return query select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),split_part(u.email,'@',1),m.user_id::text),m.role from public.memberships m join auth.users u on u.id=m.user_id where m.workspace_id=target;
end $$;
-- Triggers cover both the new board API and the existing forms/API clients.
create function public.validate_board_record() returns trigger language plpgsql security definer set search_path='' as $$
declare val jsonb; col jsonb; board_name text;
begin
 if TG_OP='UPDATE' and new.workspace_id<>old.workspace_id then raise exception 'Workspace cannot change';end if;
 if new.owner_id is not null and not exists(select 1 from public.memberships where workspace_id=new.workspace_id and user_id=new.owner_id) then raise exception 'Choose a workspace member';end if;
 if TG_TABLE_NAME='tasks' then
  board_name:='tasks';
  if new.contact_id is not null and not exists(select 1 from public.contacts where workspace_id=new.workspace_id and id=new.contact_id) then raise exception 'Choose a related contact in this workspace';end if;
  if TG_OP='UPDATE' and new.completed is distinct from old.completed and new.status is not distinct from old.status then new.status:=case when new.completed then 'Done' else 'To do' end;end if;
  new.completed:=new.status='Done';
 else board_name:=case when new.stage='Lead' then 'leads' else 'customers' end;
  if new.relationship_status not in ('Active','Inactive','Prospect') then raise exception 'Invalid relationship status';end if;
  if new.email<>'' and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email';end if;
  if new.email<>'' and (TG_OP='INSERT' or new.email is distinct from old.email) then
   perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text||lower(new.email),0));
   if exists(select 1 from public.contacts where workspace_id=new.workspace_id and id<>new.id and archived_at is null and lower(email)=lower(new.email)) then raise exception 'A contact with this email already exists. Open that record instead.';end if;
  end if;
 end if;
 if jsonb_typeof(new.custom_values)<>'object' or octet_length(new.custom_values::text)>40000 then raise exception 'Invalid custom values';end if;
 for col in select value from public.board_settings s,jsonb_array_elements(s.columns) where s.workspace_id=new.workspace_id and s.board=board_name loop
  val:=new.custom_values->(col->>'key');
  if val is not null and val<>'null'::jsonb and val<>'""'::jsonb then
   if length(val#>>'{}')>4000 then raise exception 'Custom value too long';end if;
   if col->>'type' in ('number','currency') then perform (val#>>'{}')::numeric;end if;
   if col->>'type'='date' then perform (val#>>'{}')::date;end if;
   if col->>'type'='status' and not (col->'options' ? (val#>>'{}')) then raise exception 'Invalid custom status';end if;
   if col->>'type'='person' and not exists(select 1 from public.memberships where workspace_id=new.workspace_id and user_id=(val#>>'{}')::uuid) then raise exception 'Invalid custom owner';end if;
   if col->>'type'='linked' and not exists(select 1 from public.contacts where workspace_id=new.workspace_id and id=(val#>>'{}')::uuid) then raise exception 'Invalid linked record';end if;
  end if;
 end loop;
 if TG_OP='UPDATE' then new.version:=old.version+1;end if;
 return new;
end $$;
create trigger validate_tasks before insert or update on public.tasks for each row execute function public.validate_board_record();
create trigger validate_contacts before insert or update on public.contacts for each row execute function public.validate_board_record();
create function public.run_board_rule(target uuid,rule_name text,event text,record_uuid uuid,recipient uuid,title text) returns void language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 if not exists(select 1 from public.workflow_rules where workspace_id=target and rule=rule_name and enabled) then return;end if;
 if rule_name in ('lead_won','task_assigned','task_overdue') and not exists(select 1 from public.workspaces where id=target and status='active' and 'tasks'=any(modules)) then return;end if;
 insert into public.workflow_runs(workspace_id,rule,event_key) values(target,rule_name,event) on conflict do nothing returning id into claimed;
 if claimed is null then return;end if;
 if rule_name='lead_won' then
  insert into public.tasks(workspace_id,title,contact_id,owner_id) values(target,'Onboard: '||left(title,180),record_uuid,recipient);
 else
  if recipient is not null then insert into public.workspace_notifications(workspace_id,user_id,message,record_id,board,event_key) values(target,recipient,title,record_uuid,case when rule_name='followup_due' then 'leads' else 'tasks' end,rule_name||':'||event) on conflict do nothing;end if;
 end if;
end $$;
create function public.audit_board_record() returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb:='{}';new_data jsonb;changed jsonb:='{}';k text;
begin
 new_data:=to_jsonb(new);if TG_OP='UPDATE' then old_data:=to_jsonb(old);end if;
 for k in select jsonb_object_keys(new_data) loop if k not in ('version','workspace_id','custom_values') and old_data->k is distinct from new_data->k then changed:=changed||jsonb_build_object(k,jsonb_build_object('from',old_data->k,'to',new_data->k));end if;end loop;
 if old_data->'custom_values' is distinct from new_data->'custom_values' then changed:=changed||jsonb_build_object('custom_values',jsonb_build_object('from',old_data->'custom_values','to',new_data->'custom_values'));end if;
 insert into public.record_activity(workspace_id,record_id,record_type,actor_id,action,details) values(new.workspace_id,new.id,TG_TABLE_NAME,auth.uid(),case when TG_OP='INSERT' then 'Created' when new.archived_at is not null and old_data->>'archived_at' is null then 'Archived' when new.archived_at is null and old_data->>'archived_at' is not null then 'Restored' else 'Updated' end,changed);
 if TG_TABLE_NAME='contacts' then if new.stage='Lead' and new.pipeline_stage='Won' and old_data->>'pipeline_stage' is distinct from 'Won' then perform public.run_board_rule(new.workspace_id,'lead_won',new.id::text,new.id,new.owner_id,new.name);end if;end if;
 if TG_TABLE_NAME='tasks' and new.owner_id is not null and (TG_OP='INSERT' or new.owner_id is distinct from old.owner_id) then perform public.run_board_rule(new.workspace_id,'task_assigned',new.id::text||':'||new.version,new.id,new.owner_id,'Assigned to you: '||new.title);end if;
 return new;
end $$;
create trigger audit_tasks after insert or update on public.tasks for each row execute function public.audit_board_record();
create trigger audit_contacts after insert or update on public.contacts for each row execute function public.audit_board_record();
-- Add records in place; optimistic version checks prevent silently overwriting a colleague.
create function public.save_board_record(target uuid,board text,item_id uuid,expected_version integer,patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;was_new boolean:=item_id is null;valid text[];k text; row_data jsonb;
begin
 if board is null or board not in ('tasks','leads','customers') then raise exception 'Invalid board';end if;
 perform public.require_business_tool(target,board);
 if jsonb_typeof(patch)<>'object' then raise exception 'Invalid record';end if;
 valid:=case when board='tasks' then array['title','due_date','status','priority','owner_id','contact_id','description','archived_at','custom_values'] else array['name','company','email','phone','pipeline_stage','owner_id','estimated_value','followup_date','notes','relationship_status','archived_at','custom_values'] end;
 for k in select jsonb_object_keys(patch) loop if not(k=any(valid)) then raise exception 'Unsupported field';end if;end loop;
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
  update public.contacts set name=trim(row_data->>'name'),company=row_data->>'company',email=trim(row_data->>'email'),phone=row_data->>'phone',pipeline_stage=row_data->>'pipeline_stage',owner_id=nullif(row_data->>'owner_id','')::uuid,estimated_value=(row_data->>'estimated_value')::numeric,followup_date=nullif(row_data->>'followup_date','')::date,notes=row_data->>'notes',relationship_status=row_data->>'relationship_status',archived_at=nullif(row_data->>'archived_at','')::timestamptz,custom_values=row_data->'custom_values' where id=item_id returning to_jsonb(contacts.*) into result;
 end if;
 return result;
end $$;
create function public.convert_board_lead(target uuid,item_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_tool(target,'leads');
 update public.contacts set stage='Customer' where workspace_id=target and id=item_id and stage='Lead';
 select to_jsonb(c) into result from public.contacts c where workspace_id=target and id=item_id;
 if result is null then raise exception 'Lead unavailable';end if;return result;
end $$;
create function public.configure_board(target uuid,board_name text,new_columns jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 perform public.require_business_tool(target,board_name);
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 if board_name is null or board_name not in ('tasks','leads','customers') or jsonb_typeof(new_columns)<>'array' or jsonb_array_length(new_columns)>30 or octet_length(new_columns::text)>20000 then raise exception 'Invalid columns';end if;
 for c in select value from jsonb_array_elements(new_columns) loop
  if jsonb_typeof(c) is distinct from 'object' or coalesce(c->>'key','') !~ '^custom_[a-zA-Z0-9_]{1,60}$' or coalesce(length(c->>'label'),0) not between 1 and 60 or coalesce(c->>'type','') not in ('text','number','currency','date','status','person','linked') then raise exception 'Invalid column';end if;
  if c->>'type'='status' and (jsonb_typeof(c->'options') is distinct from 'array' or jsonb_array_length(c->'options') not between 1 and 20) then raise exception 'Add 1 to 20 status choices';end if;
  if c->>'type'='status' and exists(select 1 from jsonb_array_elements(c->'options') o where jsonb_typeof(o)<>'string' or length(o#>>'{}') not between 1 and 60) then raise exception 'Invalid status choices';end if;
 end loop;
 if (select count(distinct value->>'key') from jsonb_array_elements(new_columns))<>jsonb_array_length(new_columns) then raise exception 'Duplicate columns';end if;
 insert into public.board_settings values(target,board_name,new_columns) on conflict(workspace_id,board) do update set columns=excluded.columns;
end $$;
create function public.save_board_view(target uuid,board_name text,view_name text,personal boolean,view_settings jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;k text;
begin
 perform public.require_business_tool(target,board_name);
 if board_name not in ('tasks','leads','customers') or jsonb_typeof(view_settings)<>'object' or octet_length(view_settings::text)>16000 then raise exception 'Invalid view';end if;
 for k in select jsonb_object_keys(view_settings) loop
  if k in ('search','filter','owner','sort','group') then if jsonb_typeof(view_settings->k)<>'string' or length(view_settings->>k)>200 then raise exception 'Invalid view filter';end if;
  elsif k in ('desc','archived') then if jsonb_typeof(view_settings->k)<>'boolean' then raise exception 'Invalid view toggle';end if;
  elsif k in ('hidden','order') then if jsonb_typeof(view_settings->k)<>'array' then raise exception 'Invalid view columns';end if;
   if jsonb_array_length(view_settings->k)>50 or exists(select 1 from jsonb_array_elements(view_settings->k) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>80) then raise exception 'Invalid view columns';end if;
  elsif k='widths' then if jsonb_typeof(view_settings->k)<>'object' then raise exception 'Invalid widths';end if;
   if exists(select 1 from jsonb_each(view_settings->k) v where jsonb_typeof(value)<>'number') then raise exception 'Invalid widths';end if;
   if exists(select 1 from jsonb_each_text(view_settings->k) v where value::numeric not between 140 and 450) then raise exception 'Invalid widths';end if;
  else raise exception 'Unsupported view option';end if;
 end loop;
 if not personal and not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 insert into public.board_views(workspace_id,board,user_id,name,settings) values(target,board_name,case when personal then auth.uid() else null end,trim(view_name),view_settings) returning id into result;return result;
end $$;
create function public.add_board_comment(target uuid,kind text,item_id uuid,comment_body text,mentioned uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;recipient uuid;
begin
 perform public.require_business_tool(target,case when kind='tasks' then 'tasks' else 'customers' end);
 if not ((kind='tasks' and exists(select 1 from public.tasks where workspace_id=target and id=item_id)) or (kind='contacts' and exists(select 1 from public.contacts where workspace_id=target and id=item_id))) then raise exception 'Record unavailable';end if;
 if cardinality(mentioned)>50 or exists(select 1 from unnest(mentioned) u where not exists(select 1 from public.memberships where workspace_id=target and user_id=u)) then raise exception 'Invalid mention';end if;
 insert into public.record_comments(workspace_id,record_type,record_id,author_id,body,mentions) values(target,kind,item_id,auth.uid(),trim(comment_body),coalesce(mentioned,'{}')) returning id into result;
 foreach recipient in array coalesce(mentioned,'{}') loop insert into public.workspace_notifications(workspace_id,user_id,message,record_id,board,event_key) values(target,recipient,'You were mentioned: '||left(comment_body,160),item_id,case when kind='tasks' then 'tasks' else 'customers' end,'mention:'||result) on conflict do nothing;end loop;
 return result;
end $$;
create function public.set_workflow_rule(target uuid,rule_name text,is_enabled boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 perform public.require_pro(target);
 if not exists(select 1 from public.memberships where workspace_id=target and user_id=auth.uid() and role='owner') then raise exception 'Owner access required';end if;
 if is_enabled and rule_name in ('lead_won','task_assigned','task_overdue') and not public.can_work(target,'tasks') then raise exception 'Enable Tasks before enabling this rule';end if;
 if is_enabled and rule_name='lead_won' and not public.can_work(target,'leads') then raise exception 'Enable Leads before enabling this rule';end if;
 if is_enabled and rule_name='followup_due' and not public.can_work(target,'customers') then raise exception 'Enable Customers or Leads before enabling this rule';end if;
 insert into public.workflow_rules values(target,rule_name,is_enabled) on conflict(workspace_id,rule) do update set enabled=excluded.enabled;
end $$;
create function public.mark_board_notification(target uuid,item_id uuid,is_read boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 update public.workspace_notifications set read_at=case when is_read then now() else null end where workspace_id=target and user_id=auth.uid() and id=item_id;
end $$;
create function public.run_scheduled_board_rules() returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
 for r in select t.* from public.tasks t join public.workspaces w on w.id=t.workspace_id where w.status='active' and w.plan in ('pro','custom') and 'tasks'=any(w.modules) and t.archived_at is null and not t.completed and t.due_date<current_date and t.owner_id is not null loop
  perform public.run_board_rule(r.workspace_id,'task_overdue',r.id||':'||r.due_date,r.id,r.owner_id,'Overdue: '||r.title);n:=n+1;
 end loop;
 for r in select c.*,coalesce(c.owner_id,(select user_id from public.memberships where workspace_id=c.workspace_id and role='owner' order by created_at limit 1)) recipient from public.contacts c join public.workspaces w on w.id=c.workspace_id where w.status='active' and w.plan in ('pro','custom') and ('leads'=any(w.modules) or 'customers'=any(w.modules)) and c.archived_at is null and c.followup_date<=current_date loop
  perform public.run_board_rule(r.workspace_id,'followup_due',r.id||':'||r.followup_date,r.id,r.recipient,'Follow up: '||r.name);n:=n+1;
 end loop;return n;
end $$;
-- All new tables are read-only to browser clients; writes go through checked RPCs.
do $$ declare t text;begin foreach t in array array['board_settings','board_views','record_activity','record_comments','workspace_notifications','workflow_rules','workflow_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t='board_views' then execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_work(workspace_id,board) and (user_id is null or user_id=auth.uid()))',t);
 elsif t='board_settings' then execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_work(workspace_id,board))',t);
 elsif t in ('record_activity','record_comments') then execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_work(workspace_id,case record_type when ''tasks'' then ''tasks'' else ''customers'' end))',t);
 elsif t='workspace_notifications' then execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_work(workspace_id,board) and user_id=auth.uid())',t);
 else execute format('create policy tenant_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',t);end if;
 end loop;end $$;
-- Shared member directory contains only display labels, never email addresses.
create policy colleague_read on public.memberships for select to authenticated using(public.is_workspace_member(workspace_id));
revoke delete on public.contacts,public.tasks from authenticated;
do $$ declare f record;begin for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('board_member_list','validate_board_record','audit_board_record','run_board_rule','save_board_record','convert_board_lead','configure_board','save_board_view','add_board_comment','set_workflow_rule','mark_board_notification','run_scheduled_board_rules') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('board_member_list','save_board_record','convert_board_lead','configure_board','save_board_view','add_board_comment','set_workflow_rule','mark_board_notification') then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;end $$;
grant execute on function public.run_scheduled_board_rules() to service_role;
-- Preserve new board records, comments, and configuration in existing exports/backups.
create or replace function public.backup_payload(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;table_name text;items jsonb;total bigint:=0;n bigint;
begin
 result:=jsonb_build_object('exported_at',now(),'workspace',(select to_jsonb(w) from public.workspaces w where id=target));
 foreach table_name in array array['contacts','tasks','email_followups','support_requests','business_documents','invoice_payments','work_items','board_settings','board_views','record_activity','record_comments','workspace_notifications','workflow_rules','workflow_runs'] loop
  execute format('select count(*) from public.%I where workspace_id=$1',table_name) into n using target;
  total:=total+n;if total>50000 then raise exception 'Large workspace backup needs a dedicated job';end if;
  execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from public.%I t where workspace_id=$1',table_name) into items using target;
  result:=result||jsonb_build_object(case table_name when 'email_followups' then 'followups' when 'business_documents' then 'documents' when 'invoice_payments' then 'payments' else table_name end,items);
 end loop;return result;
end $$;
-- Aggregate under the caller's RLS policies, independent of board snapshot limits.
create function public.workspace_board_report(target uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.is_workspace_member(target) then raise exception 'Workspace access required';end if;
 select jsonb_build_object(
  'today',current_date,
  'metrics',jsonb_build_object(
   'customers',(select count(*) from public.contacts where workspace_id=target and archived_at is null and stage='Customer'),
   'leads',(select count(*) from public.contacts where workspace_id=target and archived_at is null and stage='Lead' and pipeline_stage<>'Won'),
   'pipeline',(select coalesce(sum(estimated_value),0) from public.contacts where workspace_id=target and archived_at is null and stage='Lead' and pipeline_stage<>'Won'),
   'incomplete',(select count(*) from public.tasks where workspace_id=target and archived_at is null and not completed),
   'overdue',(select count(*) from public.tasks where workspace_id=target and archived_at is null and not completed and due_date<current_date),
   'followups',(select count(*) from public.contacts where workspace_id=target and archived_at is null and followup_date=current_date),
   'balance',(select coalesce(sum(total_cents-paid_cents),0) from public.business_documents where workspace_id=target and kind='Invoice' and status in ('Issued','Partial'))
  ),
  'statuses',coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.tasks where workspace_id=target and archived_at is null group by status) s),'{}'::jsonb),
  'workloads',coalesce((select jsonb_object_agg(owner,total) from (select coalesce(owner_id::text,'unassigned') owner,count(*) total from public.tasks where workspace_id=target and archived_at is null and not completed group by owner_id) s),'{}'::jsonb),
  'pipeline',coalesce((select jsonb_object_agg(pipeline_stage,jsonb_build_object('count',total,'value',value)) from (select pipeline_stage,count(*) total,sum(estimated_value) value from public.contacts where workspace_id=target and archived_at is null and stage='Lead' group by pipeline_stage) s),'{}'::jsonb),
  'payment_days',coalesce((select jsonb_agg(s order by payment_date) from (select payment_date,sum(amount_cents) amount_cents from public.invoice_payments where workspace_id=target group by payment_date) s),'[]'::jsonb),
  'upcoming',coalesce((select jsonb_agg(s) from (select id,kind,title,status,customer_id,scheduled_date from public.work_items where workspace_id=target and scheduled_date>=current_date and status not in ('Completed','Cancelled') order by scheduled_date,scheduled_time nulls last,id limit 8) s),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.workspace_board_report(uuid) from public,anon;
grant execute on function public.workspace_board_report(uuid) to authenticated;
commit;
