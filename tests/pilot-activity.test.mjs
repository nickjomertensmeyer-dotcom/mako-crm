import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pilotStage,pilotNeedsHelp,pilotDaysLeft} from '../lib/pilot-activity.ts';

test('pilot activity: real writes, deduplication, admin isolation, return days and exclusions',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 try{
 const fixture=await readFile(new URL('./operations.test.mjs',import.meta.url),'utf8');
 await db.exec(fixture.match(/await db.exec\(`([\s\S]*?)`\);/)[1].replaceAll('${A}',A).replaceAll('${B}',B));
 await db.exec('alter table auth.users add column email_confirmed_at timestamptz;');
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await q('insert into platform_admins values($1)',[A]);await q("update auth.users set email='pilot@example.com',email_confirmed_at=now() where id=$1",[B]);
 await as(B);const wid=(await q("select create_workspace('Pilot business','General business',array['customers','tasks']) id"))[0].id;
 await as(A);const invitation=(await q("select create_pilot_invitation('pilot@example.com',$1) id",['f'.repeat(64)]))[0].id;
 await as(B);await q('select accept_pilot_invitation($1)',['f'.repeat(64)]);
 await assert.rejects(q('select owner_pilot_activity()'),/Administrator/);
 await assert.rejects(q('select * from pilot_activity_days'),/permission denied/);
 await assert.rejects(q('select capture_pilot_activity($1,\'progress\')',[wid]),/permission denied/);
 await assert.rejects(q('select record_pilot_visit($1)',[A]),/membership/);
 await q('select record_pilot_visit($1)',[wid]);await q('select record_pilot_visit($1)',[wid]);
 const cid=(await q("insert into contacts(workspace_id,name) values($1,'Private customer name') returning id",[wid]))[0].id;
 const tid=(await q("insert into tasks(workspace_id,title,contact_id) values($1,'Private task',$2) returning id",[wid,cid]))[0].id;
 await q("update tasks set completed=true,status='Done' where id=$1",[tid]);
 await as(A);let report=(await q('select owner_pilot_activity() r'))[0].r;let row=report.rows[0];
 assert.ok(row.contact_at&&row.work_at&&row.progress_at);assert.equal(row.activated,false);assert.equal(row.verified,true);
 assert.ok(!JSON.stringify(report).includes('Private'));
 await db.exec('reset role');assert.equal(Number((await q("select count(*) n from pilot_activity_days where event='visit'"))[0].n),1);
 // Move the accepted pilot and successful actions back a day, then return today.
 await q("update pilot_invitations set accepted_at=now()-interval '25 hours' where id=$1",[invitation]);
 await q("update pilot_activity_days set day=day-1,first_at=first_at-interval '1 day',last_at=last_at-interval '1 day' where workspace_id=$1",[wid]);
 await as(B);await q('select record_pilot_visit($1)',[wid]);
 await as(A);row=(await q('select owner_pilot_activity() r'))[0].r.rows[0];assert.equal(row.returned,true);assert.equal(row.activated,true);
 await q('select exclude_pilot_activity($1,true)',[invitation]);
 await as(B);await q("insert into contacts(workspace_id,name) values($1,'Excluded test')",[wid]);
 await db.exec('reset role');assert.equal(Number((await q("select count(*) n from pilot_activity_days where event='contact_added'"))[0].n),1);
 // Failed transactions must never leave analytics behind.
 await as(A);await q('select exclude_pilot_activity($1,false)',[invitation]);await as(B);
 await db.exec('begin');await q("insert into contacts(workspace_id,name) values($1,'Rolled back')",[wid]);await db.exec('rollback');
 await db.exec('reset role');assert.equal(Number((await q("select count(*) n from pilot_activity_days where event='contact_added'"))[0].n),1);
 await as(B);await assert.rejects(q('select exclude_pilot_activity($1,true)',[invitation]),/Administrator/);
 // Sandbox billing does not count as conversion.
 await db.exec('reset role');await q("insert into workspace_billing(workspace_id,subscription_id,subscription_status) values($1,'sub_test','active')",[wid]);
 await as(A);assert.equal((await q('select owner_pilot_activity() r'))[0].r.rows[0].subscribed,false);
 await db.exec('reset role');await q("insert into workspace_live_billing(workspace_id,subscription_id,subscription_status) values($1,'sub_live','active')",[wid]);
 await as(A);assert.equal((await q('select owner_pilot_activity() r'))[0].r.rows[0].subscribed,true);
 }finally{await db.close();}
});
test('activity status and help flags respect grace boundaries and ended pilots',()=>{
 const now=Date.parse('2026-11-10T12:00:00Z');const row={accepted_at:'2026-11-01T12:00:00Z',ends_at:'2026-11-15T12:00:00Z',last_meaningful:'2026-11-07T12:00:00Z',verified:true,activated:false,subscribed:false};
 assert.equal(pilotNeedsHelp(row,'2026-11-01T00:00:00Z',now),true);
 assert.equal(pilotNeedsHelp(row,'2026-11-09T00:00:00Z',now),false);
 assert.equal(pilotNeedsHelp({...row,excluded:true},'2026-11-01',now),false);
 assert.equal(pilotNeedsHelp({...row,ends_at:'2026-11-09'},'2026-11-01',now),false);
 assert.equal(pilotStage(row),'Setting up');assert.equal(pilotStage({...row,activated:true}),'Activated');assert.equal(pilotStage({...row,subscribed:true}),'Subscribed');
 assert.equal(pilotDaysLeft(row.ends_at,now),5);assert.equal(pilotDaysLeft('2026-11-01',now),0);
});
