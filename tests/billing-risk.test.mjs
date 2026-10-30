import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {resolveBillingRisk} from '../lib/billing-risk.ts';
const charge={id:'ch_test',object:'charge',customer:'cus_test',livemode:false,payment_intent:'pi_test',currency:'usd',amount:10000,amount_refunded:2500,refunded:false};
const event=(type,object)=>({id:'evt_test',type,created:1793394000,livemode:false,data:{object}});
const stripe={charges:{retrieve:async()=>charge},invoicePayments:{list:()=>({async *[Symbol.asyncIterator](){yield{invoice:'in_a'};yield{invoice:'in_b'};}})},invoices:{retrieve:async id=>({id,customer:'cus_test',livemode:false,parent:{type:'subscription_details',subscription_details:{subscription:'sub_test'}}})}};
test('risk resolution follows all invoice payments, preserves refund policy and rejects other environments/accounts',async()=>{
 const rows=await resolveBillingRisk(event('charge.refunded',charge),stripe,false);
 assert.equal(rows.length,2);assert.match(rows[0].summary,/access is unchanged/);assert.equal(rows[0].amount,2500);
 assert.equal(rows[1].invoice_id,'in_b');assert.equal(rows[0].subscription_id,'sub_test');
 await assert.rejects(resolveBillingRisk(event('charge.refunded',charge),stripe,true),/environment/);
 await assert.rejects(resolveBillingRisk({...event('charge.refunded',charge),account:'acct_other'},stripe,false),/account/);
});
test('disputes and warnings resolve charge customer without changing entitlement; standalone payments remain visible',async()=>{
 const object={id:'dp_test',object:'dispute',charge:'ch_test',amount:10000};
 const rows=await resolveBillingRisk(event('charge.dispute.created',object),stripe,false);
 assert.match(rows[0].summary,/evidence/);
 const noInvoices={...stripe,invoicePayments:{list:()=>({async *[Symbol.asyncIterator](){}})}};
 const warning=await resolveBillingRisk(event('radar.early_fraud_warning.created',{id:'issfr_test',object:'radar.early_fraud_warning',charge:'ch_test'}),noInvoices,false);
 assert.equal(warning.length,1);assert.equal(warning[0].subscription_id,null);assert.match(warning[0].summary,/not a confirmed/);
 await assert.rejects(resolveBillingRisk(event('charge.refunded',charge),{...stripe,invoices:{retrieve:async()=>({customer:'cus_other',livemode:false})}},false),/ownership/);
});
test('billing alert database deduplicates events and only administrators can read or review',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;`);
  for(const name of ['202610280001_foundation','202610300025_billing_risk_alerts'])await db.exec(await readFile(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
  const uid='10000000-0000-4000-8000-000000000001';await db.exec(`insert into auth.users values('${uid}');insert into platform_admins values('${uid}');`);
  const insert=`insert into billing_risk_alerts(event_id,event_type,livemode,stripe_customer_id,charge_id,object_id,summary,occurred_at) values('evt_test','charge.refunded',false,'cus_test','ch_test','ch_test','Refund',now()) returning id`;
  const id=(await db.query(insert)).rows[0].id;await assert.rejects(db.query(insert),/unique/);
  await db.exec('set role authenticated');assert.equal((await db.query('select * from billing_risk_alerts')).rows.length,0);
  await assert.rejects(db.query('select review_billing_risk($1)',[id]),/Administrator/);
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  assert.equal((await db.query('select * from billing_risk_alerts')).rows.length,1);
  await db.query('select review_billing_risk($1)',[id]);assert.ok((await db.query('select reviewed_at from billing_risk_alerts')).rows[0].reviewed_at);
  await assert.rejects(db.query("update billing_risk_alerts set summary='tamper'"),/permission/);
 }finally{await db.close();}
});
