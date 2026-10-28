import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {decimalCents,previewTotals} from '../lib/business-tools.ts';
test('money inputs and preview use cents and reject invalid decimals',()=>{
 assert.equal(decimalCents('19.99'),1999);assert.equal(decimalCents('0.01'),1);
 for(const input of ['-1','NaN','1e4','2.345','','Infinity'])assert.equal(decimalCents(input),null);
 assert.deepEqual(previewTotals([{quantity:'0.29',price:'50.00'},{quantity:'1.5',price:'19.99'}],'7.5'),{subtotal:4449,tax:334,total:4783});
});
test('documents, receipts, and work items enforce tenant isolation and financial invariants',async()=>{
 const db=new PGlite();const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
  for(const name of ['202610280001_foundation','202610280002_pro_tools','202610280003_backups','202610280004_business_tools'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
  const mods="array['customers','tasks','quotes','invoices','jobs','schedule']";
  await as(A);const wa=(await db.query(`select public.create_workspace('Business A','Other',${mods}) id`)).rows[0].id;
  await as(B);const wb=(await db.query(`select public.create_workspace('Business B','Other',${mods}) id`)).rows[0].id;
  await db.exec(`reset role;update public.workspaces set status='active',plan='pro'`);
  await as(B);const cb=(await db.query(`insert into public.contacts(workspace_id,name) values('${wb}','Private B') returning id`)).rows[0].id;
  await as(A);const ca=(await db.query(`insert into public.contacts(workspace_id,name,email) values('${wa}','Customer A','a@example.com') returning id`)).rows[0].id;
  async function save(target,customer,kind='Invoice',id=null,items=[{description:'Service',quantity:'1.5',unit_cents:1999}]){
   return (await db.query('select public.save_business_document($1,$2,$3,$4,current_date,current_date+30,$5::jsonb,750,$6) id',[target,id,kind,customer,JSON.stringify(items),'Thank you.'])).rows[0].id;
  }
  await assert.rejects(save(wa,cb),/customer in this workspace/);
  await assert.rejects(save(wb,cb),/Active Pro/);
  await assert.rejects(save(wa,ca,'Invoice',null,[{description:'Bad',quantity:'-1',unit_cents:10}]),/quantity/);
  await assert.rejects(save(wa,ca,'Invoice',null,[{description:'Bad',quantity:'1',unit_cents:-10}]),/quantity or price/);
  await assert.rejects(save(wa,ca,'Invoice',null,[]),/1 to 30/);
  await assert.rejects(save(wa,ca,'Invoice',null,[{description:'Too large',quantity:'10000',unit_cents:100000000}]),/Total must/);
  const invoice=await save(wa,ca);
  let d=(await db.query('select * from public.business_documents')).rows[0];
  assert.equal(Number(d.subtotal_cents),2999);assert.equal(Number(d.tax_cents),225);assert.equal(Number(d.total_cents),3224);assert.equal(d.number,'INV-000001');
  await assert.rejects(db.query(`update public.business_documents set total_cents=1`),/permission denied/);
  await assert.rejects(db.query(`insert into public.invoice_payments(workspace_id,invoice_id,amount_cents,payment_date,method,request_id) values('${wa}','${invoice}',1,current_date,'Cash',gen_random_uuid())`),/permission denied/);
  await db.query(`select public.change_document_status('${wa}','${invoice}','Issued')`);
  await assert.rejects(save(wa,ca,'Invoice',invoice),/Only drafts/);
  const request='20000000-0000-4000-8000-000000000001';
  const pay=()=>db.query(`select public.record_invoice_payment('${wa}','${invoice}',1000,current_date,'Cash','Deposit','${request}')`);
  await pay();await pay();
  assert.equal((await db.query('select * from public.invoice_payments')).rows.length,1,'retried receipt is not duplicated');
  d=(await db.query('select * from public.business_documents')).rows[0];assert.equal(d.status,'Partial');assert.equal(Number(d.paid_cents),1000);
  await assert.rejects(db.query(`select public.change_document_status('${wa}','${invoice}','Void')`),/Invalid status/);
  await assert.rejects(db.query(`select public.record_invoice_payment('${wa}','${invoice}',2225,current_date,'Cash','',gen_random_uuid())`),/Check amount/);
  await assert.rejects(db.query(`select public.record_invoice_payment('${wa}','${invoice}',-1,current_date,'Cash','',gen_random_uuid())`),/Check amount/);
  await assert.rejects(db.query(`select public.record_invoice_payment('${wa}','${invoice}',1,current_date+1,'Cash','',gen_random_uuid())`),/Check amount/);
  await db.query(`select public.record_invoice_payment('${wa}','${invoice}',2224,current_date,'Cash','',gen_random_uuid())`);
  assert.equal((await db.query(`select status from public.business_documents where id='${invoice}'`)).rows[0].status,'Paid');
  const quote=await save(wa,ca,'Quote');
  await assert.rejects(db.query(`select public.convert_quote_to_invoice('${wa}','${quote}')`),/Accept the quote/);
  await db.exec(`select public.change_document_status('${wa}','${quote}','Issued');select public.change_document_status('${wa}','${quote}','Accepted')`);
  const converted=(await db.query(`select public.convert_quote_to_invoice('${wa}','${quote}') id`)).rows[0].id;
  assert.equal((await db.query(`select public.convert_quote_to_invoice('${wa}','${quote}') id`)).rows[0].id,converted,'conversion retries return the same invoice');
  await db.query(`select public.save_work_item('${wa}',null,'Job','Customer A job','${ca}',current_date,'09:30','Project notes')`);
  await assert.rejects(db.query(`select public.save_work_item('${wa}',null,'Job','Injected','${cb}',current_date,null,'')`),/customer from this workspace/);
  const job=(await db.query('select id from public.work_items')).rows[0].id;
  await as(B);
  assert.equal((await db.query('select * from public.business_documents')).rows.length,0);assert.equal((await db.query('select * from public.invoice_payments')).rows.length,0);assert.equal((await db.query('select * from public.work_items')).rows.length,0);
  await assert.rejects(db.query(`select public.change_document_status('${wa}','${invoice}','Void')`),/Active Pro|Invalid status/);
  await assert.rejects(db.query(`select public.record_invoice_payment('${wa}','${invoice}',1,current_date,'Cash','',gen_random_uuid())`),/Active Pro/);
  await assert.rejects(db.query(`select public.change_work_status('${wb}','${job}','Completed')`),/not found/);
  const otherSummary=(await db.query(`select public.workspace_business_summary('${wa}') result`)).rows[0].result;assert.equal(otherSummary.paid_total,0);
  await as(A);const exported=(await db.query(`select public.export_workspace('${wa}') result`)).rows[0].result;assert.equal(exported.documents.length,3);assert.equal(exported.payments.length,2);assert.equal(exported.work_items.length,1);
  await db.query(`select public.configure_workspace('${wa}','Business A','Other',array['customers','tasks'])`);
  assert.equal((await db.query('select * from public.business_documents')).rows.length,0);
  await assert.rejects(save(wa,ca),/Enable this tool/);
  assert.equal((await db.query(`select public.export_workspace('${wa}') result`)).rows[0].result.documents.length,3,'disabled tools remain included in owner exports');
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select * from public.business_documents'),/permission denied/);
  await assert.rejects(db.query(`select public.workspace_business_summary('${wa}')`),/permission denied/);
 }finally{await db.close();}
});
