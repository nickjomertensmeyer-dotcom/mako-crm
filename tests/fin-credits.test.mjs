import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {paidFinPeriod} from '../lib/fin-billing.ts';
import {validateFinResult} from '../lib/fin.ts';
test('AI grants require an actually paid matching renewal, not trials, prorations or wrong environments',()=>{
 const now=1800000000,base={id:'in_paid',status:'paid',livemode:false,customer:'cus_a',amount_paid:4900,currency:'usd',billing_reason:'subscription_cycle',parent:{subscription_details:{subscription:'sub_a'}},lines:{data:[{amount:4900,period:{start:now-10,end:now+1000},pricing:{price_details:{price:'price_starter'}}}]}},prices={starter:'price_starter',pro:'price_pro',team:'price_team'};
 assert.equal(paidFinPeriod(base,false,prices,now).tier,'starter');
 for(const change of [{amount_paid:0},{status:'open'},{livemode:true},{billing_reason:'subscription_update'},{parent:null},{lines:{has_more:true,data:base.lines.data}},{lines:{data:[{...base.lines.data[0],pricing:{price_details:{price:'price_other'}}}]}}])assert.equal(paidFinPeriod({...base,...change},false,prices,now),null);
});
test('Fin rejects fabricated customer/service IDs, invalid dates and prices; derives prices from catalog',()=>{
 const context={contacts:[{id:'customer',name:'Sample',stage:'Customer'}],services:[{id:'mow',name:'Mow',unit_cents:5000}]};
 const a={kind:'quote',title:'Lawn service',contact_id:'customer',date:'2026-12-01',time:null,notes:'',lines:[{service_id:'mow',quantity:2,unit_cents:1}]};
 const result=validateFinResult({answer:'Review this draft.',action:a},context);assert.equal(result.cost,3);assert.equal(result.action.lines[0].unit_cents,5000);
 for(const change of [{contact_id:'outsider'},{date:'2026-02-30'},{lines:[{service_id:'invented',quantity:1}]},{lines:[{service_id:'mow',quantity:-1}]}])assert.throws(()=>validateFinResult({answer:'Preview',action:{...a,...change}},context));
});
test('Fin validates personal settings, new contacts and record edits without accepting arbitrary fields',()=>{
 const context={contacts:[{id:'known',name:'Test',stage:'Customer',version:2}],tasks:[{id:'task',title:'Call',version:4}],services:[]};
 const action=(kind,data)=>({answer:'Review this change.',action:{kind,title:'Requested change',contact_id:null,date:null,time:null,notes:'',lines:[],data_json:JSON.stringify(data)}});
 assert.equal(validateFinResult(action('preferences',{appearance:'dark'}),context).action.data.appearance,'dark');
 assert.equal(validateFinResult(action('customer',{first_name:'QA',last_name:'Person',birthday:'1990-02-01'}),context).cost,1);
 assert.equal(validateFinResult(action('update_contact',{record_id:'known',phone:'3145550100'}),context).action.data.expected_version,2);
 for(const [kind,data] of [['preferences',{role:'owner'}],['preferences',{appearance:'invalid'}],['customer',{first_name:'QA',email:'not-an-email'}],['customer',{first_name:'QA',birthday:'2026-02-30'}],['update_contact',{record_id:'outside',phone:'3145550100'}],['update_task',{record_id:'task'}],['operation',{kind:'asset',record_id:'old',details:{}}]])assert.throws(()=>validateFinResult(action(kind,data),context));
});

test('paid AI ledger isolates tenants, settles actions once, releases failures, enforces limits and rejects duplicate grants',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 try{
  const source=await readFile(new URL('./operations.test.mjs',import.meta.url),'utf8');await db.exec(source.match(/await db.exec\(`([\s\S]*?)`\);/)[1].replaceAll('${A}',A).replaceAll('${B}',B));
  await db.exec("alter table auth.users add column email_confirmed_at timestamptz;");
  for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  await as(A);const w=(await q("select create_workspace('Fin QA','Landscaping & lawn care',array['customers','tasks','quotes','schedule']) id"))[0].id;
  await as(B);const other=(await q("select create_workspace('Other QA','General business',array['customers','tasks']) id"))[0].id;
  await db.exec("reset role;update workspaces set status='active',plan='pro';update fin_config set live_mode=false,enabled=true;");
  await q("insert into workspace_billing(workspace_id,stripe_customer_id,subscription_id) values($1,'cus_fin','sub_fin')",[w]);
  await as(A);await assert.rejects(q('select reserve_fin($1,$2)',[w,randomUUID()]),/successful paid/);
  await assert.rejects(q("select grant_fin_period('cus_fin','sub_fin','in_fake','starter',now()-interval '1 day',now()+interval '29 days',false)"),/permission denied/);
  await db.exec('reset role;set role service_role');
  const grant=()=>q("select grant_fin_period('cus_fin','sub_fin','in_paid','starter',now()-interval '1 day',now()+interval '29 days',false)");
  await db.exec('reset role;update fin_config set live_mode=true;set role service_role');await assert.rejects(grant(),/Wrong Fin billing environment/);
  await db.exec('reset role');await q('update fin_config set sandbox_workspace_id=$1',[w]);await db.exec('set role service_role');await grant();await grant();
  await db.exec('reset role');assert.equal((await q('select * from fin_credit_periods')).length,1);
  await as(B);await assert.rejects(q('select fin_balance($1)',[w]),/access required/);await assert.rejects(q('select reserve_fin($1,$2)',[w,randomUUID()]),/access|active/i);assert.equal((await q('select fin_balance($1) b',[other]))[0].b.remaining,0);
  await as(A);const id=randomUUID();await q('select reserve_fin($1,$2)',[w,id]);assert.equal((await q('select fin_balance($1) b',[w]))[0].b.remaining,47);
  await assert.rejects(q('select reserve_fin($1,$2)',[w,randomUUID()]),/Finish or cancel/);
  await assert.rejects(q('select prepare_fin($1,null,1,1,10,10)',[id]),/permission denied/);
  await db.exec('reset role;set role service_role');
  const action={kind:'task',title:'Fin QA follow-up',contact_id:null,date:null,time:null,notes:'Fictional QA',lines:[]};
  await q('select prepare_fin($1,$2,1,1,10,10)',[id,JSON.stringify(action)]);
  await as(B);await assert.rejects(q('select finish_fin($1,$2,true)',[w,id]),/access|active/i);
  await as(A);const saved=(await q('select finish_fin($1,$2,true) r',[w,id]))[0].r;assert.equal((await q('select finish_fin($1,$2,true) r',[w,id]))[0].r.id,saved.id);
  assert.equal((await q('select * from tasks where workspace_id=$1',[w])).length,1);assert.equal((await q('select fin_balance($1) b',[w]))[0].b.remaining,49);
  const cancel=randomUUID();await q('select reserve_fin($1,$2)',[w,cancel]);await db.exec('reset role;set role service_role');await q('select prepare_fin($1,$2,1,1,10,10)',[cancel,JSON.stringify(action)]);await as(A);await q('select finish_fin($1,$2,false)',[w,cancel]);assert.equal((await q('select fin_balance($1) b',[w]))[0].b.remaining,49);
  const expired=randomUUID();await q('select reserve_fin($1,$2)',[w,expired]);await db.exec('reset role');await q("update fin_requests set expires_at=now()-interval '1 second' where id=$1",[expired]);await as(A);assert.equal((await q('select fin_balance($1) b',[w]))[0].b.remaining,49);await assert.rejects(q('select finish_fin($1,$2,true)',[w,expired]),/expired/);
  // Every new action executes through the same paid, isolated, idempotent ledger.
  await db.exec("reset role");await q("update workspaces set modules=array['customers','leads','tasks','quotes','invoices','jobs','schedule','assets','inventory','projects'] where id=$1",[w]);await as(A);
  const run=async(kind,data={},common={})=>{const request=randomUUID();await q('select reserve_fin($1,$2)',[w,request]);await db.exec('reset role;set role service_role');const proposal={kind,title:'Fictional Fin QA',contact_id:null,date:null,time:null,notes:'QA only',lines:[],data,...common};await q('select prepare_fin($1,$2,$3,1,10,10)',[request,JSON.stringify(proposal),['job','invoice','operation'].includes(kind)?3:1]);await as(A);return {request,result:(await q('select finish_fin($1,$2,true) r',[w,request]))[0].r};};
  const created=await run('customer',{first_name:'Fictional',last_name:'Customer',email:'fictional@example.com',birthday:'1990-01-01'});
  assert.equal((await q('select first_name,last_name,birthday from contacts where id=$1',[created.result.id]))[0].last_name,'Customer');
  assert.equal((await q('select finish_fin($1,$2,true) r',[w,created.request]))[0].r.id,created.result.id);
  const version=(await q('select version from contacts where id=$1',[created.result.id]))[0].version;
  await run('update_contact',{record_id:created.result.id,expected_version:version,stage:'Customer',phone:'3145550100'});
  const lead=await run('lead',{first_name:'Fictional Lead'});assert.equal((await q('select stage from contacts where id=$1',[lead.result.id]))[0].stage,'Lead');
  await run('update_task',{record_id:saved.id,expected_version:1,status:'Done'});assert.equal((await q('select status from tasks where id=$1',[saved.id]))[0].status,'Done');
  const preference=await run('preferences',{appearance:'light',density:'compact',reduced_motion:true});assert.equal(preference.result.preferences.appearance,'light');
  await db.exec('reset role');assert.equal((await q('select raw_user_meta_data from auth.users where id=$1',[A]))[0].raw_user_meta_data.mako_appearance,'light');assert.deepEqual((await q('select raw_user_meta_data from auth.users where id=$1',[B]))[0].raw_user_meta_data,{});await as(A);
  const svc=await run('service',{description:'QA mow',unit_cents:5500},{title:'QA mowing'});
  const job=await run('job',{}, {contact_id:created.result.id,date:'2026-12-01',time:'10:00'});await run('checklist',{record_id:job.result.id,label:'Check gate'});await run('work_status',{record_id:job.result.id,previous_status:'Planned',status:'Completed'});
  const invoice=await run('invoice',{}, {contact_id:created.result.id,date:'2026-12-01',lines:[{service_id:svc.result.id,unit_cents:5500,quantity:2}]});assert.equal((await q('select total_cents,status from business_documents where id=$1',[invoice.result.id]))[0].total_cents,11000);await run('document_status',{record_id:invoice.result.id,previous_status:'Draft',status:'Issued'});
  const product=await run('operation',{kind:'product',status:'Active',details:{sku:'QA-001',unit:'bag'}});await run('stock',{record_id:product.result.id,quantity:2,reason:'QA opening stock'});assert.equal(Number((await q('select sum(quantity) q from stock_movements where product_id=$1',[product.result.id]))[0].q),2);
  assert.equal((await run('navigate',{view:'settings'})).result.navigate,true);
  const reject=async(kind,data,pattern)=>{await assert.rejects(run(kind,data),pattern);await db.exec("reset role;update fin_requests set state='failed',proposal=null where state='prepared'");await as(A);};
  await reject('customer',{first_name:'Duplicate',email:'fictional@example.com'},/matching contact/i);
  await reject('update_contact',{record_id:created.result.id,expected_version:version,stage:'Customer',phone:'3145550101'},/record changed/i);
  await reject('preferences',{role:'owner'},/Invalid preferences/);
  await reject('operation',{kind:'asset',status:'Active',details:{},record_id:product.result.id,expected_version:1},/changed/i);

  await db.exec('reset role;update fin_config set monthly_budget_cents=100;');await q('update fin_requests set cost_cents=10');await q("insert into fin_requests(id,workspace_id,user_id,period_id,credits,state,cost_cents) select gen_random_uuid(),$1,$2,id,1,'failed',10 from fin_credit_periods cross join generate_series(1,10)",[w,A]);await as(A);await assert.rejects(q('select reserve_fin($1,$2)',[w,randomUUID()]),/spending limit/);
 }finally{await db.close();}
});
