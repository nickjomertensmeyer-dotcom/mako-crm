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
test('paid AI ledger isolates tenants, settles actions once, releases failures, enforces limits and rejects duplicate grants',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 try{
  const source=await readFile(new URL('./operations.test.mjs',import.meta.url),'utf8');await db.exec(source.match(/await db.exec\(`([\s\S]*?)`\);/)[1].replaceAll('${A}',A).replaceAll('${B}',B));
  await db.exec('alter table auth.users add column email_confirmed_at timestamptz;');
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
  await db.exec('reset role;update fin_config set monthly_budget_cents=100;');await q('update fin_requests set cost_cents=10');await q("insert into fin_requests(id,workspace_id,user_id,period_id,credits,state,cost_cents) select gen_random_uuid(),$1,$2,id,1,'failed',10 from fin_credit_periods cross join generate_series(1,10)",[w,A]);await as(A);await assert.rejects(q('select reserve_fin($1,$2)',[w,randomUUID()]),/spending limit/);
 }finally{await db.close();}
});
