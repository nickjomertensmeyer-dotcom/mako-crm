import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {accountingMarker,invoiceSyncIssue,invoiceSyncPayload,paymentSyncPayload} from '../lib/accounting-model.ts';

test('accounting payloads preserve cents, stable tenant references and exclude charges and tax',()=>{
 const doc={id:'invoice',kind:'Invoice',status:'Issued',customer_id:'customer',customer:{name:'Fictional QA'},number:'INV-1',issued_date:'2026-10-30',due_date:'2026-11-30',currency:'USD',tax_cents:0,subtotal_cents:2999,total_cents:2999,items:[{description:'QA service',quantity:1.5,unit_cents:1999,total_cents:2999}]};
 assert.equal(invoiceSyncIssue(doc),'');
 const payload=invoiceSyncPayload(doc,'1','2','workspace');
 assert.equal(payload.Line[0].Amount,29.99);assert.equal(payload.AllowOnlineCreditCardPayment,false);assert.equal(payload.EmailStatus,'NotSet');
 assert.equal(payload.DocNumber,accountingMarker('Invoice','workspace','invoice'));assert.notEqual(payload.DocNumber,accountingMarker('Invoice','other','invoice'));
 for(const changed of [{status:'Draft'},{kind:'Quote'},{tax_cents:10},{currency:'EUR'},{total_cents:3000}])assert.ok(invoiceSyncIssue({...doc,...changed}));
 const p=paymentSyncPayload({id:'payment',amount_cents:501,payment_date:'2026-10-30'},'123','1','4','workspace');
 assert.equal(p.TotalAmt,5.01);assert.deepEqual(p.Line[0].LinkedTxn,[{TxnId:'123',TxnType:'Invoice'}]);assert.equal(p.DepositToAccountRef.value,'4');
 assert.throws(()=>paymentSyncPayload({id:'x',amount_cents:-1,payment_date:'2026-10-30'},'1','2','3','w'));
});

test('accounting queue and job claims are server-only, idempotent and preserve concurrent updates',async()=>{
 const db=new PGlite(),uid='10000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${uid}');`);
  for(const name of ['202610280001_foundation','202610280002_pro_tools','202610280003_backups','202610280004_business_tools','202610300020_accounting_sync','202610300021_accounting_source_access','202610300022_quickbooks_diagnostics'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  const wid=(await db.query("select create_workspace('Accounting QA','Other',array['customers','invoices']) id")).rows[0].id;
  await db.exec("reset role;update workspaces set status='active',plan='pro';set role authenticated");
  const customer=(await db.query("insert into contacts(workspace_id,name) values($1,'QA') returning id",[wid])).rows[0].id;
  const invoice=(await db.query("select save_business_document($1,null,'Invoice',$2,current_date,current_date+30,$3,0,'QA') id",[wid,customer,JSON.stringify([{description:'QA',quantity:'1',unit_cents:1000}])])).rows[0].id;
  for(const table of ['qb_sync_settings','qb_sync_jobs','qb_sync_queue','qb_api_events'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
  await assert.rejects(db.query('select claim_accounting_queue()'),/permission denied/);
  await db.exec('reset role');
  await db.query("insert into qb_sync_settings(workspace_id,owner_id,realm_id,environment,enabled,automatic,service_item_id,deposit_account_id,starts_at) values($1,$2,'1','sandbox',true,true,'1','2',now()-interval '1 day')",[wid,uid]);
  await db.exec('set role authenticated');await db.query("select change_document_status($1,$2,'Issued')",[wid,invoice]);await db.exec('reset role;set role service_role');
  await db.query("insert into qb_api_events(reference,workspace_id,user_id,environment,operation,method,status,intuit_tid,category) values(gen_random_uuid(),$1,$2,'sandbox','accounting.query','GET',400,'safe-fixture-tid','validation')",[wid,uid]);assert.equal((await db.query('select intuit_tid from qb_api_events')).rows[0].intuit_tid,'safe-fixture-tid');assert.equal((await db.query('select id from workspaces where id=$1',[wid])).rows.length,1);assert.equal((await db.query('select id from business_documents where id=$1',[invoice])).rows.length,1);const first=(await db.query('select * from claim_accounting_queue()')).rows[0];assert.equal(first.invoice_id,invoice);assert.equal((await db.query('select * from claim_accounting_queue()')).rows.length,0);
  await db.exec('reset role;set role authenticated');await db.query("select record_invoice_payment($1,$2,500,current_date,'Cash','QA',gen_random_uuid())",[wid,invoice]);await db.exec('reset role;set role service_role');
  assert.equal((await db.query('delete from qb_sync_queue where invoice_id=$1 and version=$2 returning invoice_id',[invoice,first.version])).rows.length,0,'new payment is not lost by old worker');
  const job=(await db.query("insert into qb_sync_jobs(workspace_id,realm_id,environment,kind,source_id,source_hash,payload) values($1,'1','sandbox','Invoice',$2,'hash','{}') returning id",[wid,invoice])).rows[0].id;
  const claim='20000000-0000-4000-8000-000000000001';
  assert.ok((await db.query('select claim_qb_sync($1,$2) result',[job,claim])).rows[0].result);assert.equal((await db.query('select claim_qb_sync($1,$2) result',[job,claim])).rows[0].result,null);
  await assert.rejects(db.query("insert into qb_sync_jobs(workspace_id,realm_id,environment,kind,source_id,source_hash,payload) values($1,'1','sandbox','Invoice',$2,'hash','{}')",[wid,invoice]),/duplicate key/);
  await db.exec('reset role');await db.query('update qb_sync_settings set enabled=false where workspace_id=$1',[wid]);await db.query('delete from qb_sync_queue where invoice_id=$1',[invoice]);await db.exec('set role authenticated');await db.query("select record_invoice_payment($1,$2,500,current_date,'Cash','QA',gen_random_uuid())",[wid,invoice]);await db.exec('reset role');assert.equal((await db.query('select * from qb_sync_queue')).rows.length,0,'paused sync does not enqueue');
 }finally{await db.close();}
});
