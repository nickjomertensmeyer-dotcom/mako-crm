import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {businessTypes,industries,modules,recommendedTools} from '../lib/presets.ts';
test('industry presets are complete, backwards compatible, and recommend only implemented tools',()=>{
 assert.equal(industries.length,28);assert.equal(new Set(industries).size,28);
 for(const name of ['General business','Mobile detailing','Tree service','Cleaning','Consulting','Other'])assert.ok(industries.includes(name));
 for(const type of businessTypes){const selected=recommendedTools(type.name);assert.ok(type.description);assert.ok(selected.length);assert.equal(new Set(selected).size,selected.length);assert.ok(selected.every(key=>modules.includes(key)&&key!=='team'));}
 assert.ok(recommendedTools('HVAC').includes('jobs'));assert.ok(!recommendedTools('Beauty & wellness').includes('jobs'));
 const copy=recommendedTools('HVAC');copy.length=0;assert.ok(recommendedTools('HVAC').length);
 assert.deepEqual(recommendedTools('unknown'),recommendedTools('General business'));
});
test('expanded industry database validation preserves owners, records, provisioning, and access restrictions',async()=>{
 const db=new PGlite();const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
  for(const file of ['202610280001_foundation.sql','202610280008_business_type_presets.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  for(const name of industries)assert.equal((await db.query('select is_supported_business_type($1) valid',[name])).rows[0].valid,true);
  assert.equal((await db.query("select is_supported_business_type('invented') valid")).rows[0].valid,false);
  async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
  await as(a);const wa=(await db.query("select create_workspace('Alpha','Tree service',$1) id",[recommendedTools('Tree service')])).rows[0].id;
  assert.equal((await db.query('select status from workspaces where id=$1',[wa])).rows[0].status,'pending');
  await db.exec("reset role;update workspaces set status='active',plan='pro';");await as(a);
  await db.query("insert into contacts(workspace_id,name) values($1,'Keep this customer')",[wa]);
  await db.query("select configure_workspace($1,'Alpha','Beauty & wellness',$2)",[wa,recommendedTools('Beauty & wellness')]);
  assert.equal((await db.query('select * from contacts')).rows.length,1);
  await assert.rejects(db.query("select configure_workspace($1,'Alpha','invented',array['customers'])",[wa]),/Invalid business type/);
  await as(b);await db.query("select create_workspace('Beta','HVAC',$1)",[recommendedTools('HVAC')]);
  await assert.rejects(db.query("select configure_workspace($1,'Changed','HVAC',array['customers'])",[wa]),/Owner access/);
  assert.equal((await db.query('select * from contacts')).rows.length,0);
  await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('anon','public.configure_workspace(uuid,text,text,text[])','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
