import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {formProof,validFormProof} from '../lib/lead-form.ts';
import {boundedBody} from '../lib/request-body.ts';
import {normalizePerson,mailPayload,safeFileLink,contactImportMessage} from '../lib/connections-model.ts';
test('contact imports normalize provider fields and message payloads reject header injection',()=>{
 assert.equal(normalizePerson({resourceName:'https://evil.example/',names:[{displayName:'Fake'}]}),null);
 const person=normalizePerson({resourceName:'people/c123',names:[{displayName:'Alex'}],emailAddresses:[{value:'bad\r\nBcc: victim@example.com'},{value:'alex@example.com'}],organizations:[{name:'Example Studio'}]});assert.equal(person.email,'alex@example.com');
 for(const subject of ['','Hi\r\nBcc: victim@example.com'])assert.throws(()=>mailPayload('alex@example.com',subject,'hello'));
 assert.throws(()=>mailPayload('bad address','Hi','hello'));assert.match(mailPayload('alex@example.com','Hello 🌊','Message'),/Content-Type: text\/plain/);
 assert.equal(contactImportMessage({created:0,skipped:1}),'Contact already imported.');
 assert.equal(contactImportMessage({created:0,skipped:0,restored:1}),'Contact restored.');
 assert.equal(safeFileLink('https://evil.example/'),null);assert.equal(safeFileLink('javascript:alert(1)'),null);assert.ok(safeFileLink('https://drive.google.com/file/d/example/view'));
});
test('connections credentials are server-only; import is tenant-isolated and idempotent',async()=>{
 const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id) values('${a}'),('${b}');`);
 for(const name of ['202610280001_foundation','202610280002_pro_tools','202610280003_backups','202610280004_business_tools','202610280005_boards','202610290017_connections','202610290018_lead_forms','202610290019_connection_refresh','202610300027_contact_import_restore'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
 await as(a);const wa=(await db.query("select create_workspace('Alpha','Other',array['customers','leads']) id")).rows[0].id;
 await as(b);const wb=(await db.query("select create_workspace('Beta','Other',array['customers']) id")).rows[0].id;await db.exec("reset role;update workspaces set status='active',plan='pro';");await as(a);
 const people=JSON.stringify([{externalId:'people/c1',name:'Fictional Alex',email:'alex@example.com',phone:'',company:'Example'}]);
 assert.deepEqual((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',people,'Customer'])).rows[0].result,{created:1,skipped:0,restored:0});
 assert.deepEqual((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',people,'Lead'])).rows[0].result,{created:0,skipped:1,restored:0});
 const imported=(await db.query('select id from contacts where workspace_id=$1',[wa])).rows[0].id;
 await db.query("update contacts set archived_at=now(),notes='Keep this history' where id=$1",[imported]);
 assert.deepEqual((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',people,'Lead'])).rows[0].result,{created:0,skipped:0,restored:1});
 const restored=(await db.query('select id,stage,archived_at,notes from contacts where id=$1',[imported])).rows[0];
 assert.equal(restored.stage,'Lead');assert.equal(restored.archived_at,null);assert.equal(restored.notes,'Keep this history');
 assert.equal((await db.query("select count(*)::int n from record_activity where record_id=$1 and action='Restored'",[imported])).rows[0].n,1);
 assert.equal((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',people,'Customer'])).rows[0].result.skipped,1);
 await db.exec('reset role');await db.query('delete from contacts where id=$1',[imported]);await as(a);
 assert.deepEqual((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',people,'Customer'])).rows[0].result,{created:1,skipped:0,restored:0});
 const otherSource=JSON.stringify([{externalId:'people/c2',name:'Different label',email:'alex@example.com',phone:'',company:''}]);assert.equal((await db.query('select import_connected_contacts($1,$2,$3,$4) result',[wa,'google-contacts',otherSource,'Customer'])).rows[0].result.skipped,1);
 assert.equal((await db.query('select name from contacts where workspace_id=$1',[wa])).rows[0].name,'Fictional Alex');
 for(const table of ['app_connections','contact_import_links','connected_messages','connected_files'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
 await as(b);await assert.rejects(db.query('select import_connected_contacts($1,$2,$3,$4)',[wa,'google-contacts',people,'Customer']),/Active Pro|access/i);
 await assert.rejects(db.query('select import_connected_contacts($1,$2,$3,$4)',[wb,'google-contacts',people,'Lead']),/Enable this tool/i);
 await db.exec('reset role');const form=(await db.query("insert into website_lead_forms(workspace_id,enabled) values($1,true) returning id",[wa])).rows[0].id;
 await db.query("insert into app_connections(workspace_id,user_id,provider,credential) values($1,$2,'quickbooks','encrypted-fixture')",[wa,a]);await db.exec('set role service_role');
 const claim='30000000-0000-4000-8000-000000000001',otherClaim='30000000-0000-4000-8000-000000000002';
 assert.equal((await db.query("select claim_connection_refresh($1,$2,'quickbooks',$3) token",[wa,a,claim])).rows[0].token,'encrypted-fixture');
 assert.equal((await db.query("select claim_connection_refresh($1,$2,'quickbooks',$3) token",[wa,a,otherClaim])).rows[0].token,null);
 assert.equal((await db.query("select claim_connection_refresh($1,$2,'quickbooks',$3) token",[wb,a,otherClaim])).rows[0].token,null);await db.exec('reset role');
 await as(b);await assert.rejects(db.query('select submit_website_lead($1,$2,$3,$4)',[form,b,'a'.repeat(64),JSON.stringify({name:'Visitor',email:'visitor@example.com',message:'Enquiry'})]),/permission denied/);
 await db.exec('reset role;set role service_role');const submission='20000000-0000-4000-8000-000000000001',visitor=JSON.stringify({name:'Visitor',email:'visitor@example.com',message:'Fictional enquiry'});
 await db.query('select submit_website_lead($1,$2,$3,$4)',[form,submission,'a'.repeat(64),visitor]);await db.query('select submit_website_lead($1,$2,$3,$4)',[form,submission,'a'.repeat(64),visitor]);
 await db.exec('reset role');assert.equal((await db.query("select count(*) count from contacts where workspace_id=$1 and email='visitor@example.com'",[wa])).rows[0].count,1);
 await db.query('update website_lead_forms set enabled=false where id=$1',[form]);await db.exec('set role service_role');await assert.rejects(db.query('select submit_website_lead($1,$2,$3,$4)',[form,'20000000-0000-4000-8000-000000000002','a'.repeat(64),visitor]),/unavailable/);
 await db.exec("reset role;update workspaces set status='pending';");await as(a);await assert.rejects(db.query('select import_connected_contacts($1,$2,$3,$4)',[wa,'google-contacts',people,'Customer']),/Active Pro/i);
 }finally{await db.close();}
});

test('website forms reject forged, expired and immediate proofs; API bodies have actual byte limits',async()=>{const id='form',key='fixture',now=Date.now(),proof=formProof(id,key,now-3000);assert.ok(validFormProof(id,proof,key,now));assert.equal(validFormProof('other',proof,key,now),false);assert.equal(validFormProof(id,formProof(id,key,now),key,now),false);assert.equal(validFormProof(id,proof,key,now+3600000),false);await assert.rejects(boundedBody(new Request('https://mako.example',{method:'POST',body:'x'.repeat(101)}),100),/too large/);});
