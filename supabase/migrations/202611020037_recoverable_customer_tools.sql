begin;
alter table public.message_templates add column removed_at timestamptz;
alter table public.job_checklist add column removed_at timestamptz;
create or replace function public.save_message_template(target uuid,item uuid,title text,email_subject text,email_body text,remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_pro(target);
 if item is not null and not exists(select 1 from public.message_templates where id=item and workspace_id=target) then raise exception 'Template unavailable';end if;
 if remove then update public.message_templates set removed_at=now() where id=item and workspace_id=target;return item;end if;
 if item is null then
 if (select count(*) from public.message_templates where workspace_id=target)>=100 then raise exception 'Use up to 100 templates';end if;
 insert into public.message_templates(workspace_id,name,subject,body) values(target,trim(title),trim(email_subject),email_body) returning id into result;
 else update public.message_templates set removed_at=null,name=trim(title),subject=trim(email_subject),body=email_body where id=item and workspace_id=target returning id into result;end if;
 return result;
end $$;
create or replace function public.save_job_check(target uuid,work uuid,item uuid,title text,checked boolean,remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_business_tool(target,'jobs');
 if not exists(select 1 from public.work_items where id=work and workspace_id=target and kind='Job' and archived_at is null) then raise exception 'Job unavailable';end if;
 if item is not null and not exists(select 1 from public.job_checklist where id=item and workspace_id=target and work_id=work) then raise exception 'Checklist item unavailable';end if;
 if remove then update public.job_checklist set removed_at=now() where id=item and workspace_id=target;return item;end if;
 if item is null then
 if (select count(*) from public.job_checklist where work_id=work)>=100 then raise exception 'Use up to 100 checklist items';end if;
 insert into public.job_checklist(workspace_id,work_id,label,done) values(target,work,trim(title),checked) returning id into result;
 else update public.job_checklist set removed_at=null,label=trim(title),done=checked where id=item and workspace_id=target returning id into result;end if;
 return result;
end $$;

create table public.job_photo_trash (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 work_id uuid not null references public.work_items(id) on delete cascade,
 name text not null, removed_at timestamptz not null default now(),primary key(work_id,name)
);
alter table public.job_photo_trash enable row level security;
revoke all on public.job_photo_trash from public,anon,authenticated;
grant select on public.job_photo_trash to authenticated;
create policy photo_trash_read on public.job_photo_trash for select to authenticated using(public.can_work(workspace_id,'jobs'));
create function public.set_job_photo_removed(target uuid,work uuid,filename text,remove boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_business_tool(target,'jobs');
 if filename is null or filename !~ '^(before|after)-[0-9a-f-]+\.(png|jpg|webp)$' or not exists(select 1 from public.work_items where id=work and workspace_id=target and kind='Job' and archived_at is null) then raise exception 'Photo unavailable';end if;
 if not exists(select 1 from storage.objects where bucket_id='job-photos' and name=target::text||'/'||work::text||'/'||filename) then raise exception 'Photo unavailable';end if;
 if remove then insert into public.job_photo_trash values(target,work,filename,now()) on conflict(work_id,name) do update set removed_at=now();
 else delete from public.job_photo_trash where workspace_id=target and work_id=work and name=filename;end if;
end $$;
revoke all on function public.set_job_photo_removed(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_job_photo_removed(uuid,uuid,text,boolean) to authenticated;
commit;
