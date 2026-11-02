import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseContactCsv,duplicateImport,validateImportContact,daysSince} from '../lib/sales-workflows.ts';
test('CSV handles quoted fields, BOM, multiline notes and rejects malformed files',()=>{
 assert.deepEqual(parseContactCsv('\ufeffname,email,notes\r\n"Doe, Jane",j@example.com,"first\nsecond ""quoted"""'),[['name','email','notes'],['Doe, Jane','j@example.com','first\nsecond "quoted"']]);
 assert.throws(()=>parseContactCsv('name\n"unfinished'));assert.throws(()=>parseContactCsv('name\n"Jane"x'));assert.throws(()=>parseContactCsv('name\n'+'Jane\n'.repeat(201)));
 assert.ok(validateImportContact({name:'Jane',company:'',email:'bad',phone:'',notes:''}));assert.equal(duplicateImport({name:'Jane',company:'',email:'A@EXAMPLE.COM',phone:'',notes:''},[{name:'Other',email:'a@example.com'}]),true);assert.equal(daysSince('2026-10-01T12:00:00Z','2026-10-09'),8);
});
test('customer growth tools enforce isolation, recurrence, portals, deposits and photo access',async()=>{
 const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id,email) values('${a}','a@example.com'),('${b}','b@example.com');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 async function as(id){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 await as(a);const wa=(await q("select create_workspace('Alpha','General business',array['customers','leads','quotes','invoices','jobs']) id"))[0].id;
 await as(b);const wb=(await q("select create_workspace('Beta','General business',array['customers','quotes','invoices','jobs']) id"))[0].id;
 await db.exec("reset role;update workspaces set status='active',plan='pro';");await as(a);
 const service=(await q("select save_service($1,null,'Visit','Site visit',2500,false) id",[wa]))[0].id;
 await as(b);assert.equal((await q('select * from service_catalog')).length,0);await assert.rejects(q("select save_service($1,$2,'Wrong','Wrong',1,false)",[wa,service]),/Active Pro/);await as(a);
 const batch='20000000-0000-4000-8000-000000000001',rows=JSON.stringify([{name:'QA',email:'qa@example.com',phone:'',notes:'Keep',company:''}]);
 let result=(await q("select import_contact_csv($1,'customers',$2,$3) result",[wa,batch,rows]))[0].result;assert.equal(result.added,1);assert.deepEqual((await q("select import_contact_csv($1,'customers',$2,$3) result",[wa,batch,rows]))[0].result,result);assert.equal((await q('select * from contacts')).length,1);
 result=(await q("select import_contact_csv($1,'customers',gen_random_uuid(),$2) result",[wa,rows]))[0].result;assert.equal(result.skipped,1);
 const cid=(await q('select id from contacts'))[0].id;
 await db.exec('reset role;set role service_role');assert.equal((await q('select id,workspace_id,name,archived_at from contacts where id=$1',[cid])).length,1);await assert.rejects(q('select email from contacts where id=$1',[cid]),/permission denied/);await as(a);
 await q('select set_customer_tags($1,$2,$3)',[wa,cid,['VIP','Repeat customer','vip']]);assert.equal((await q('select * from customer_tags')).length,2);
 const template=(await q("select save_message_template($1,null,'Review','Your review','Please leave honest feedback.',false) id",[wa]))[0].id;
 await as(b);assert.equal((await q('select * from customer_tags')).length,0);assert.equal((await q('select * from message_templates')).length,0);await assert.rejects(q('select set_customer_tags($1,$2,$3)',[wa,cid,['Wrong']]),/Active Pro/);await assert.rejects(q("select save_message_template($1,$2,'Wrong','Wrong','Wrong content',false)",[wb,template]),/unavailable/);await as(a);
 const quote=(await q("select save_business_document($1,null,'Quote',$2,current_date,current_date+10,$3,0,'QA') id",[wa,cid,JSON.stringify([{description:'Service',quantity:'1',unit_cents:2500}])]))[0].id;
 await q("select change_document_status($1,$2,'Issued')",[wa,quote]);const hash='a'.repeat(64);
 await q('select share_quote($1,$2,$3,false)',[wa,quote,hash]);await assert.rejects(q("select respond_to_quote($1,'Accepted','QA Customer')",[hash]),/permission denied/);
 await as(b);assert.equal((await q('select * from quote_shares')).length,0);await assert.rejects(q('select share_quote($1,$2,$3,true)',[wa,quote,hash]),/Active Pro/);
 await db.exec('reset role;set role service_role');assert.equal((await q("select respond_to_quote($1,'Accepted','QA Customer') result",[hash]))[0].result,'Accepted');assert.equal((await q("select respond_to_quote($1,'Declined','Other') result",[hash]))[0].result,'Accepted');
 await as(a);const invoice=(await q('select convert_quote_to_invoice($1,$2) id',[wa,quote]))[0].id;assert.equal((await q('select convert_quote_to_invoice($1,$2) id',[wa,quote]))[0].id,invoice);
 const job=(await q('select quote_to_job($1,$2,current_date) id',[wa,quote]))[0].id;assert.equal((await q('select quote_to_job($1,$2,current_date) id',[wa,quote]))[0].id,job);
 await q("select save_job_check($1,$2,null,'Take before photo',false,false)",[wa,job]);assert.equal((await q('select * from job_checklist')).length,1);
 assert.equal((await q("select job_photo_access($1) ok",[wa+'/'+job+'/before-test.png']))[0].ok,true);
 await as(b);assert.equal((await q('select * from job_checklist')).length,0);assert.equal((await q("select job_photo_access($1) ok",[wa+'/'+job+'/before-test.png']))[0].ok,false);await as(a);
 await q('select share_customer_portal($1,$2,$3,false)',[wa,cid,'b'.repeat(64)]);
 const q2=(await q("select save_business_document($1,null,'Quote',$2,current_date,current_date+10,$3,0,'') id",[wa,cid,JSON.stringify([{description:'Work',quantity:'1',unit_cents:4000}])]))[0].id;
 await q("select change_document_status($1,$2,'Issued')",[wa,q2]);
 await db.exec('reset role;set role service_role');await q("select portal_quote_decision($1,$2,'Accepted','QA Customer')",['b'.repeat(64),q2]);await q("select portal_quote_decision($1,$2,'Declined','QA Customer')",['b'.repeat(64),q2]);await as(a);assert.equal((await q('select status from business_documents where id=$1',[q2]))[0].status,'Accepted');
 await q('select share_customer_portal($1,$2,$3,true)',[wa,cid,'b'.repeat(64)]);await db.exec('reset role;set role service_role');await assert.rejects(q("select portal_quote_decision($1,$2,'Accepted','QA Customer')",['b'.repeat(64),q2]),/unavailable/);await as(a);
 await q("select save_invoice_schedule($1,$2,current_date,'Monthly',null,false)",[wa,invoice]);await db.exec('reset role;set role service_role');assert.equal((await q('select run_invoice_schedules() n'))[0].n,1);assert.equal((await q('select run_invoice_schedules() n'))[0].n,0);await as(a);const generated=(await q('select invoice_id from scheduled_invoices'))[0].invoice_id;assert.equal((await q('select status from business_documents where id=$1',[generated]))[0].status,'Draft');
 await q("select change_document_status($1,$2,'Issued')",[wa,generated]);await db.exec('reset role;set role service_role');await q("insert into workspace_stripe_connect(workspace_id,account_id,live,enabled) values($1,'acct_qa',false,true)",[wa]);
 const checkout=(await q("select (reserve_invoice_deposit($1,$2,'acct_qa',false,500)).*",[wa,generated]))[0];await assert.rejects(q("select reserve_invoice_deposit($1,$2,'acct_qa',false,600)",[wa,generated]),/existing checkout/);await q("update invoice_checkouts set session_id='cs_test_deposit' where id=$1",[checkout.id]);await q("select settle_invoice_checkout($1)",[checkout.id]);await q("select settle_invoice_checkout($1)",[checkout.id]);await as(a);assert.equal((await q('select paid_cents from business_documents where id=$1',[generated]))[0].paid_cents,500);assert.equal((await q('select status from business_documents where id=$1',[generated]))[0].status,'Partial');
 await q("select change_document_status($1,$2,'Issued')",[wa,invoice]);const rid='30000000-0000-4000-8000-000000000001';const args=[wa,invoice,rid];
 await q("select queue_invoice_reminder($1,$2,now()+interval '1 day','Reminder','Please pay {{balance}}',true,$3)",args);await q("select queue_invoice_reminder($1,$2,now()+interval '1 day','Reminder','Please pay {{balance}}',true,$3)",args);assert.equal((await q('select * from email_followups')).length,1);
 await q("select record_invoice_payment($1,$2,2500,current_date,'Cash','QA',gen_random_uuid())",[wa,invoice]);assert.equal((await q('select status from email_followups'))[0].status,'Cancelled');
 await q('select share_quote($1,$2,$3,true)',[wa,quote,hash]);await db.exec('reset role;set role service_role');await assert.rejects(q("select respond_to_quote($1,'Accepted','QA')",[hash]),/expired/);
 await db.exec('reset role;set role anon');await assert.rejects(q('select * from quote_shares'),/permission denied/);await assert.rejects(q('select * from service_catalog'),/permission denied/);
 }finally{await db.close();}
});
