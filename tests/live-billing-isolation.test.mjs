import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('live billing preserves sandbox mappings, restricts access and processes retries once',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;`);
  for(const name of ['202610280001_foundation','202610290010_workspace_archive','202610290011_billing','202610290012_subscription_access','202610290013_checkout_schedule','202610300024_live_billing_isolation'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  const uid='10000000-0000-4000-8000-000000000001';
  await db.exec(`insert into auth.users values('${uid}');select set_config('request.jwt.claim.sub','${uid}',false);`);
  const wid=(await db.query("select create_workspace('Billing test','Other',array['customers']) id")).rows[0].id;
  await db.query("insert into workspace_billing(workspace_id,stripe_customer_id) values($1,'cus_test')",[wid]);
  await db.query("insert into workspace_live_billing(workspace_id,stripe_customer_id) values($1,'cus_live')",[wid]);
  assert.equal((await db.query("select claim_live_billing_sync('cus_test','evt_wrong') token")).rows[0].token,null);
  const token=(await db.query("select claim_live_billing_sync('cus_live','evt_live') token")).rows[0].token;
  await db.query("select apply_live_billing_sync('cus_live','evt_live',$1,'sub_live','active',true,false)",[token]);
  assert.equal((await db.query("select claim_live_billing_sync('cus_live','evt_live') token")).rows[0].token,null);
  assert.equal((await db.query('select subscription_status from workspace_billing')).rows[0].subscription_status,'none');
  await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);set role authenticated;");
  assert.equal((await db.query('select * from workspace_live_billing')).rows.length,0);
  await assert.rejects(db.query("select claim_live_billing_sync('cus_live','evt_attack')"),/permission denied/);
 }finally{await db.close();}
});
