import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('invoice checkout locks balances, isolates tenants, and settles retries once',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
  for(const name of ['202610280001_foundation','202610280002_pro_tools','202610280003_backups','202610280004_business_tools','202610300023_stripe_connect'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  async function as(id){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
  await as(A);const wa=(await q("select create_workspace('Alpha','Other',array['customers','invoices']) id"))[0].id;
  await as(B);const wb=(await q("select create_workspace('Beta','Other',array['customers','invoices']) id"))[0].id;
  await db.exec("reset role;update workspaces set status='active',plan='pro'");await as(A);
  const customer=(await q('insert into contacts(workspace_id,name) values($1,\'Sample\') returning id',[wa]))[0].id;
  const invoice=(await q(`select save_business_document($1,null,'Invoice',$2,current_date,current_date+30,$3::jsonb,0,'') id`,[wa,customer,JSON.stringify([{description:'Service',quantity:'1',unit_cents:2000}])]))[0].id;
  await q("select change_document_status($1,$2,'Issued')",[wa,invoice]);
  await assert.rejects(q('select reserve_invoice_checkout($1,$2,\'acct_test\',false)',[wa,invoice]),/permission denied/);
  await db.exec('reset role;set role service_role');
  await q("insert into workspace_stripe_connect(workspace_id,live,account_id) values($1,false,'acct_test')",[wa]);
  await assert.rejects(q("select reserve_invoice_checkout($1,$2,'acct_test',false)",[wb,invoice]),/unpaid invoice/);
  const reserve=()=>q("select (reserve_invoice_checkout($1,$2,'acct_test',false)).*",[wa,invoice]);
  const c=(await reserve())[0];assert.equal((await reserve())[0].id,c.id);
  await as(A);
  await assert.rejects(q("select record_invoice_payment($1,$2,500,current_date,'Cash','',gen_random_uuid())",[wa,invoice]),/Close the Stripe checkout/);
  await as(B);await assert.rejects(q('select * from invoice_checkouts'),/permission denied/);
  await db.exec('reset role;set role service_role');
  await q("update invoice_checkouts set session_id='cs_test_example',state='open' where id=$1",[c.id]);
  await q('select settle_invoice_checkout($1)',[c.id]);await q('select settle_invoice_checkout($1)',[c.id]);
  await db.exec('reset role');
  assert.equal(Number((await q('select paid_cents from business_documents where id=$1',[invoice]))[0].paid_cents),2000);
  assert.equal((await q('select * from invoice_payments where invoice_id=$1',[invoice])).length,1);
 }finally{await db.close();}
});
