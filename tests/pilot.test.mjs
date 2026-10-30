import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('pilot invitations enforce verified identity, tenancy, one-time activation, expiry and paid upgrades',async()=>{
 const db=new PGlite();const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 try{
 const existing=await readFile(new URL('./operations.test.mjs',import.meta.url),'utf8');
 const bootstrap=existing.match(/await db.exec\(`([\s\S]*?)`\);/)[1].replaceAll('${A}',A).replaceAll('${B}',B);
 await db.exec(bootstrap);await db.exec("alter table auth.users add column email_confirmed_at timestamptz;");
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await q("update auth.users set email=case when id=$1 then 'admin@example.com' else 'owner@example.com' end,email_confirmed_at=now()",[A]);
 await q('insert into platform_admins(user_id) values($1)',[A]);await q("insert into auth.users(id,email,email_confirmed_at) values($1,'other@example.com',now())",[C]);
 await as(B);const wid=(await q("select create_workspace('Pilot business','General business',array['customers','tasks']) id"))[0].id;
 await assert.rejects(q('select create_pilot_invitation($1,$2)',['owner@example.com','a'.repeat(64)]),/Administrator/);
 await as(A);const id=(await q('select create_pilot_invitation($1,$2) id',['OWNER@example.com','a'.repeat(64)]))[0].id;
 await q('select create_pilot_invitation($1,$2)',['owner@example.com','b'.repeat(64)]);
 await as(C);assert.equal((await q('select id,email from pilot_invitations')).length,0);
 await assert.rejects(q('select accept_pilot_invitation($1)',['b'.repeat(64)]),/unavailable/);
 await as(B);await assert.rejects(q('select token_hash from pilot_invitations'),/permission denied/);
 await assert.rejects(q('select accept_pilot_invitation($1)',['a'.repeat(64)]),/unavailable/);
 await db.exec('reset role');await q('update auth.users set email_confirmed_at=null where id=$1',[B]);await as(B);
 await assert.rejects(q('select accept_pilot_invitation($1)',['b'.repeat(64)]),/Verified/);
 await db.exec('reset role');await q('update auth.users set email_confirmed_at=now() where id=$1',[B]);await as(B);
 await q('select accept_pilot_invitation($1)',['b'.repeat(64)]);
 const initial=(await q('select pilot_ends_at,status,plan from workspaces where id=$1',[wid]))[0];assert.equal(initial.status,'active');assert.equal(initial.plan,'pro');
 assert.ok(Math.abs(new Date(initial.pilot_ends_at).getTime()-Date.now()-14*86400000)<60000);
 await q('select accept_pilot_invitation($1)',['b'.repeat(64)]);assert.deepEqual((await q('select pilot_ends_at,status,plan from workspaces where id=$1',[wid]))[0],initial);
 await q("insert into tasks(workspace_id,title) values($1,'Preserved test task')",[wid]);
 await assert.rejects(q('update workspaces set pilot_ends_at=now()+interval \'1 year\' where id=$1',[wid]),/permission denied/);
 await as(A);await assert.rejects(q('select create_pilot_invitation($1,$2)',['owner@example.com','c'.repeat(64)]),/already accepted/);
 await db.exec('reset role');await q("update workspaces set pilot_ends_at=now()-interval '1 second' where id=$1",[wid]);await as(B);
 assert.equal((await q("select can_work($1,'tasks') allowed",[wid]))[0].allowed,false);
 await db.exec('reset role');await assert.rejects(q('select require_pro($1)',[wid]),/Active/);await as(B);
 await assert.rejects(q("insert into tasks(workspace_id,title) values($1,'Denied')",[wid]),/row-level security/);
 await db.exec('reset role;set role service_role');await q('select expire_pilots()');await db.exec('reset role');
 assert.equal((await q('select status from workspaces where id=$1',[wid]))[0].status,'suspended');assert.equal((await q('select count(*) n from tasks where workspace_id=$1',[wid]))[0].n,1);
 // A failed checkout must not stop an ongoing pilot; paid success permanently removes its deadline.
 await q("update workspaces set status='active',pilot_ends_at=now()+interval '2 days' where id=$1",[wid]);
 await q("insert into workspace_live_billing(workspace_id,stripe_customer_id) values($1,'cus_pilot')",[wid]);
 for(const [event,paid] of [['evt_failed',false],['evt_paid',true]]){
 await db.exec('set role service_role');const token=(await q('select claim_live_billing_sync($1,$2) token',['cus_pilot',event]))[0].token;
 await q('select apply_live_billing_sync($1,$2,$3,$4,$5,$6,false)',['cus_pilot',event,token,'sub_pilot',paid?'active':'incomplete',paid]);await db.exec('reset role');
 const w=(await q('select status,pilot_ends_at from workspaces where id=$1',[wid]))[0];assert.equal(w.status,'active');assert.equal(w.pilot_ends_at===null,paid);
 }
 await as(A);await q('select revoke_pilot_invitation($1)',[id]);assert.equal((await q('select status from workspaces where id=$1',[wid]))[0].status,'active');
 // Unused revoked invitations cannot activate.
 await q('select create_pilot_invitation($1,$2)',['other@example.com','d'.repeat(64)]);const other=(await q("select id from pilot_invitations where email='other@example.com'"))[0].id;
 await q('select revoke_pilot_invitation($1)',[other]);await as(C);await assert.rejects(q('select accept_pilot_invitation($1)',['d'.repeat(64)]),/unavailable/);
 }finally{await db.close();}
});

