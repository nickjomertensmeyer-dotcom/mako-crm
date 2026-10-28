import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
test('database enforces tenant isolation, provisioning, and role restrictions',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610280001_foundation.sql',import.meta.url),'utf8'));
 async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
 await as(A);
 const wa=(await db.query("select public.create_workspace('Business A','General business',array['customers','tasks']) as id")).rows[0].id;
 await assert.rejects(db.query("select public.create_workspace('Duplicate','General business',array['tasks'])"),/Workspace already exists/);
 await assert.rejects(db.query(`select public.provision_workspace('${wa}','custom','active')`),/administrator/);
 await assert.rejects(db.query(`update public.workspaces set plan='custom' where id='${wa}'`),/permission denied/);
 await assert.rejects(db.query(`insert into public.contacts(workspace_id,name) values('${wa}','Pending must not save')`),/row-level security/);
 await as(B);
 const wb=(await db.query("select public.create_workspace('Business B','Consulting',array['customers','tasks']) as id")).rows[0].id;
 await db.exec('reset role');
 await db.exec(`update public.workspaces set status='active',plan='pro';insert into public.platform_admins values('${A}');`);
 await as(B);
 await db.exec(`insert into public.contacts(workspace_id,name) values('${wb}','Private B customer');insert into public.tasks(workspace_id,title) values('${wb}','Private B task');`);
 await assert.rejects(db.exec(`insert into public.memberships(workspace_id,user_id,role) values('${wa}','${B}','owner')`),/permission denied/);
 assert.equal((await db.query(`select * from public.workspaces where id='${wa}'`)).rows.length,0);
 await assert.rejects(db.query(`select public.configure_workspace('${wa}','Hacked','Other',array['tasks'])`),/Owner access required/);
 await as(A);
 assert.equal((await db.query('select * from public.contacts')).rows.length,0,'even platform admins do not automatically read customer data');
 assert.equal((await db.query('select * from public.tasks')).rows.length,0);
 await assert.rejects(db.exec(`insert into public.contacts(workspace_id,name) values('${wb}','Injected')`),/row-level security/);
 await db.exec(`insert into public.contacts(workspace_id,name) values('${wa}','Own A customer');insert into public.tasks(workspace_id,title) values('${wa}','Own A task');`);
 assert.equal((await db.query('select * from public.contacts')).rows.length,1);
 await assert.rejects(db.exec(`update public.contacts set workspace_id='${wb}' where workspace_id='${wa}'`),/row-level security/);
 assert.equal((await db.query(`update public.contacts set name='Hacked' where workspace_id='${wb}' returning id`)).rows.length,0);
 assert.equal((await db.query(`delete from public.tasks where workspace_id='${wb}' returning id`)).rows.length,0);
 await db.exec(`select public.provision_workspace('${wa}','custom','active')`);
 assert.equal((await db.query(`select plan from public.workspaces where id='${wa}'`)).rows[0].plan,'custom');
 await as(B);
 assert.equal((await db.query('select * from public.contacts')).rows[0].name,'Private B customer');
 await db.exec(`select public.configure_workspace('${wb}','Business B','Consulting',array['tasks'])`);
 assert.equal((await db.query('select * from public.contacts')).rows.length,0,'disabled modules cannot access records');
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from public.contacts'),/permission denied/);
 await assert.rejects(db.query("select public.create_workspace('Anonymous','Other',array['tasks'])"),/permission denied/);
 }finally{await db.close();}
});
