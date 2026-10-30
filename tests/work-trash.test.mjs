import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('work Trash enforces workspace access, preserves links, blocks stale edits and updates reports',async()=>{
 const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id) values('${a}'),('${b}');`);
  for(const file of ['202610280001_foundation','202610280002_pro_tools','202610280003_backups','202610280004_business_tools','202610280005_boards','202610290016_work_trash'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8'));
  async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
  await as(a);const wa=(await db.query("select create_workspace('Alpha','Other',array['schedule','jobs','customers']) id")).rows[0].id;
  await as(b);const wb=(await db.query("select create_workspace('Beta','Other',array['schedule','jobs']) id")).rows[0].id;
  await db.exec("reset role;update workspaces set status='active',plan='pro';");await as(a);
  await db.query("select save_work_item($1,null,'Appointment','Keep linked appointment',null,current_date,'10:00',null)",[wa]);
  const item=(await db.query('select id from work_items where workspace_id=$1',[wa])).rows[0].id;
  await db.exec(`reset role;create table fixture_work_links(work_id uuid references work_items(id));insert into fixture_work_links values('${item}');`);await as(a);
  assert.equal((await db.query('select workspace_business_summary($1) value',[wa])).rows[0].value.upcoming_work,1);
  await db.query('select set_work_item_trash($1,$2,false)',[wa,item]);
  const archived=(await db.query('select archived_at,status from work_items where id=$1',[item])).rows[0];assert.ok(archived.archived_at);assert.equal(archived.status,'Planned');
  await db.query('select set_work_item_trash($1,$2,false)',[wa,item]);assert.deepEqual((await db.query('select archived_at from work_items where id=$1',[item])).rows[0].archived_at,archived.archived_at);
  assert.equal((await db.query('select workspace_business_summary($1) value',[wa])).rows[0].value.upcoming_work,0);assert.equal((await db.query('select workspace_board_report($1) value',[wa])).rows[0].value.upcoming.length,0);
  await assert.rejects(db.query("select change_work_status($1,$2,'Completed')",[wa,item]),/not found/);
  await assert.rejects(db.query("select save_work_item($1,$2,'Appointment','Stale edit',null,current_date,null,null)",[wa,item]),/not found/);
  await as(b);await assert.rejects(db.query('select set_work_item_trash($1,$2,true)',[wa,item]),/Active Pro|access/i);await assert.rejects(db.query('select set_work_item_trash($1,$2,true)',[wb,item]),/not found/);
  await as(a);await db.query('select set_work_item_trash($1,$2,true)',[wa,item]);assert.equal((await db.query('select archived_at from work_items where id=$1',[item])).rows[0].archived_at,null);assert.equal((await db.query('select workspace_board_report($1) value',[wa])).rows[0].value.upcoming.length,1);
  await db.exec('reset role');assert.equal((await db.query('select count(*) from fixture_work_links')).rows[0].count,1);await db.query("update workspaces set status='pending' where id=$1",[wa]);await as(a);await assert.rejects(db.query('select set_work_item_trash($1,$2,false)',[wa,item]),/Active Pro/);
 }finally{await db.close();}
});
