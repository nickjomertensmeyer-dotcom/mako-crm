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
test('workflow database enforces isolation, quote decisions, idempotent conversion/import, and reminder cancellation',async()=>{
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
 const quote=(await q("select save_business_document($1,null,'Quote',$2,current_date,current_date+10,$3,0,'QA') id",[wa,cid,JSON.stringify([{description:'Service',quantity:'1',unit_cents:2500}])]))[0].id;
 await q("select change_document_status($1,$2,'Issued')",[wa,quote]);const hash='a'.repeat(64);
 await q('select share_quote($1,$2,$3,false)',[wa,quote,hash]);await assert.rejects(q("select respond_to_quote($1,'Accepted','QA Customer')",[hash]),/permission denied/);
 await as(b);assert.equal((await q('select * from quote_shares')).length,0);await assert.rejects(q('select share_quote($1,$2,$3,true)',[wa,quote,hash]),/Active Pro/);
 await db.exec('reset role;set role service_role');assert.equal((await q("select respond_to_quote($1,'Accepted','QA Customer') result",[hash]))[0].result,'Accepted');assert.equal((await q("select respond_to_quote($1,'Declined','Other') result",[hash]))[0].result,'Accepted');
 await as(a);const invoice=(await q('select convert_quote_to_invoice($1,$2) id',[wa,quote]))[0].id;assert.equal((await q('select convert_quote_to_invoice($1,$2) id',[wa,quote]))[0].id,invoice);
 const job=(await q('select quote_to_job($1,$2,current_date) id',[wa,quote]))[0].id;assert.equal((await q('select quote_to_job($1,$2,current_date) id',[wa,quote]))[0].id,job);
 await q("select change_document_status($1,$2,'Issued')",[wa,invoice]);const rid='30000000-0000-4000-8000-000000000001';const args=[wa,invoice,rid];
 await q("select queue_invoice_reminder($1,$2,now()+interval '1 day','Reminder','Please pay {{balance}}',true,$3)",args);await q("select queue_invoice_reminder($1,$2,now()+interval '1 day','Reminder','Please pay {{balance}}',true,$3)",args);assert.equal((await q('select * from email_followups')).length,1);
 await q("select record_invoice_payment($1,$2,2500,current_date,'Cash','QA',gen_random_uuid())",[wa,invoice]);assert.equal((await q('select status from email_followups'))[0].status,'Cancelled');
 await q('select share_quote($1,$2,$3,true)',[wa,quote,hash]);await db.exec('reset role;set role service_role');await assert.rejects(q("select respond_to_quote($1,'Accepted','QA')",[hash]),/expired/);
 await db.exec('reset role;set role anon');await assert.rejects(q('select * from quote_shares'),/permission denied/);await assert.rejects(q('select * from service_catalog'),/permission denied/);
 }finally{await db.close();}
});
