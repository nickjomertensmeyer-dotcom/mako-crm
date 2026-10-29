import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {projectCosts,stockOnHand} from '../lib/operations.ts';
test('operations: isolated relationships, optimistic edits, atomic inventory, recurring retries and public booking',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id) values('${A}'),('${B}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 async function as(id){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 await as(A);const wa=(await q("select create_workspace('Alpha','HVAC',array['assets','recurring','booking','projects','inventory','schedule','jobs','customers']) id"))[0].id;
 await as(B);const wb=(await q("select create_workspace('Beta','HVAC',array['assets','inventory']) id"))[0].id;
 await db.exec("reset role;update workspaces set status='active',plan='pro'");await as(A);
 const save=async(kind,title,details={},id=null,version=null,status='Active',customer=null)=>(await q('select to_jsonb(save_operation($1,$2,$3,$4,$5,$6,null,$7,\'\',$8::jsonb,false)) r',[wa,id,version,kind,title,customer,status,JSON.stringify(details)]))[0].r;
 const product=await save('product','Filter',{sku:'F1',unit:'each',minimum:'2'}),supplier=await save('supplier','Supply');
 await q("select move_stock($1,$2,10,'Opening',$3)",[wa,product.id,A]);await q("select move_stock($1,$2,10,'Retry',$3)",[wa,product.id,A]);
 assert.equal(Number((await q('select sum(quantity) n from stock_movements'))[0].n),10);
 await assert.rejects(q("select move_stock($1,$2,-11,'Too much',$3)",[wa,product.id,B]),/Not enough/);
 const po=await save('purchase','Order',{supplier:supplier.id,product:product.id,quantity:'3',amount:'20'});
 await q('select receive_purchase($1,$2)',[wa,po.id]);await q('select receive_purchase($1,$2)',[wa,po.id]);assert.equal(Number((await q('select sum(quantity) n from stock_movements'))[0].n),13);assert.equal(Number((await q('select inventory_totals($1) r',[wa]))[0].r[product.id]),13);
 await assert.rejects(save('purchase','Bad',{supplier:supplier.id,product:product.id,quantity:'30'},po.id,2),/Received purchases/);
 await assert.rejects(save('product','Stale',product.details,product.id,0),/Record changed/);
 const plan=await save('plan','Monthly visit',{next_date:new Date().toISOString().slice(0,10),frequency:'Monthly',timezone:'UTC'});
 await db.exec('reset role;set role service_role');await q('select run_service_plans()');await q('select run_service_plans()');await db.exec('reset role');assert.equal((await q('select * from plan_visits where plan_id=$1',[plan.id])).length,1);
 await as(B);assert.equal((await q('select * from operation_records')).length,0);
 await assert.rejects(q("select move_stock($1,$2,2,'Other tenant',$3)",[wa,product.id,B]),/Enable|active|access/i);
 await assert.rejects(q("select save_operation($1,null,null,'asset','Other',null,null,'Active','',$2::jsonb,false)",[wb,JSON.stringify({category:'Equipment',identifier:'x',details:''})]).then(async()=>q("select save_operation($1,null,null,'purchase','Bad link',null,null,'Active','',$2::jsonb,false)",[wb,JSON.stringify({supplier:supplier.id,product:product.id,quantity:'1'})])),/Related record/);
 await as(A);const slot=await save('slot','Consultation',{starts_at:new Date(Date.now()+86400000).toISOString(),minutes:'30'},null,null,'Published');
 await assert.rejects(save('slot','Overlapping',{starts_at:new Date(Date.now()+86400000+60000).toISOString(),minutes:'30'},null,null,'Published'),/overlaps/);
 await db.exec('reset role;set role anon');assert.equal((await q('select public_booking_slots($1) r',[wa]))[0].r.length,1);
 const reservation=(await q("select reserve_booking($1,'Guest','guest@example.com',$2) r",[slot.id,A]))[0].r;await q("select reserve_booking($1,'Guest','guest@example.com',$2)",[slot.id,A]);
 await assert.rejects(q("select reserve_booking($1,'Guest 2','guest2@example.com',$2)",[slot.id,B]),/no longer available/);assert.equal((await q('select public_booking_slots($1) r',[wa]))[0].r.length,0);
 await q('select cancel_booking($1)',[reservation.cancel]);assert.equal((await q('select public_booking_slots($1) r',[wa]))[0].r.length,1);
 await assert.rejects(q('select * from booking_requests'),/permission denied/);
 await db.exec('reset role');const backup=(await q('select backup_payload($1) r',[wa]))[0].r;assert.ok(backup.operation_records);
 }finally{await db.close();}
});
test('costs are recorded internal costs, stock is a signed ledger',()=>{assert.equal(projectCosts([{kind:'time',details:{project:'p',minutes:'90',rate:'40'}},{kind:'expense',details:{project:'p',amount:'25.50'}}],'p'),8550);assert.equal(stockOnHand([{product_id:'p',quantity:10},{product_id:'p',quantity:-3}],'p'),7);});
