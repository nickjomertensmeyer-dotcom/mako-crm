import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('team invitations enforce email identity, paid capacity, workspace isolation and owner controls',async()=>{
 const db=new PGlite(),A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003',D='10000000-0000-4000-8000-000000000004';
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const as=async(id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 try{
  const source=await readFile(new URL('./operations.test.mjs',import.meta.url),'utf8');await db.exec(source.match(/await db.exec\(`([\s\S]*?)`\);/)[1].replaceAll('${A}',A).replaceAll('${B}',B));
  await db.exec('alter table auth.users add column email_confirmed_at timestamptz;');
  for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  await q("update auth.users set email=case when id=$1 then 'owner@example.com' else 'member@example.com' end,email_confirmed_at=now()",[A]);await q("insert into auth.users(id,email,email_confirmed_at) values($1,'outsider@example.com',now()),($2,'next@example.com',now())",[C,D]);
  await as(A);const w=(await q("select create_workspace('Detailing team','Mobile detailing',array['customers','tasks']) id"))[0].id;
  await db.exec("reset role;update workspaces set status='active',plan='pro',licensed_users=2,billing_tier='starter';");await as(A);
  await q("insert into contacts(workspace_id,name) values($1,'Private customer')",[w]);
  const invitation=(await q('select create_team_invitation($1,$2,$3) id',[w,'MEMBER@example.com','a'.repeat(64)]))[0].id;
  await assert.rejects(q('select create_team_invitation($1,$2,$3)',[w,'next@example.com','b'.repeat(64)]),/No available user seats/);
  await as(C);assert.equal((await q('select * from team_invitations')).length,0);assert.equal((await q('select * from contacts')).length,0);
  await assert.rejects(q('select accept_team_invitation($1)',['a'.repeat(64)]),/unavailable/);await assert.rejects(q('select create_team_invitation($1,$2,$3)',[w,'next@example.com','b'.repeat(64)]),/owner required/);
  await db.exec('reset role');await q('update auth.users set email_confirmed_at=null where id=$1',[B]);await as(B);await assert.rejects(q('select accept_team_invitation($1)',['a'.repeat(64)]),/verified/);
  await db.exec('reset role');await q('update auth.users set email_confirmed_at=now() where id=$1',[B]);await as(B);
  assert.equal((await q('select accept_team_invitation($1) id',['a'.repeat(64)]))[0].id,w);assert.equal((await q('select accept_team_invitation($1) id',['a'.repeat(64)]))[0].id,w);
  assert.equal((await q('select * from contacts')).length,1);await assert.rejects(q('select remove_team_member($1,$2)',[w,A]),/Owner/);
  await db.exec('reset role');await q('update workspaces set licensed_users=1 where id=$1',[w]);await as(B);
  assert.equal((await q('select is_workspace_member($1) allowed',[w]))[0].allowed,false);assert.equal((await q('select * from contacts')).length,0);
  await as(A);assert.equal((await q('select * from contacts')).length,1);await q('select remove_team_member($1,$2)',[w,B]);await q('select remove_team_member($1,$2)',[w,A]);assert.equal((await q('select * from memberships')).length,1);
  await db.exec('reset role');await q('update workspaces set licensed_users=2 where id=$1',[w]);await as(A);const next=(await q('select create_team_invitation($1,$2,$3) id',[w,'next@example.com','b'.repeat(64)]))[0].id;await q('select revoke_team_invitation($1,$2)',[w,next]);await as(D);await assert.rejects(q('select accept_team_invitation($1)',['b'.repeat(64)]),/unavailable/);
  await as(A);await q('select revoke_team_invitation($1,$2)',[w,invitation]);
  await db.exec('reset role');await q("insert into workspace_billing(workspace_id,stripe_customer_id) values($1,'cus_seats')",[w]);await db.exec('set role service_role');
  const token=(await q("select claim_billing_sync('cus_seats','evt_seats') token"))[0].token;
  await q("select apply_tier_billing_sync(false,'cus_seats','evt_seats',$1,'sub_seats','active',true,false,'team',14)",[token]);
  await db.exec('reset role');assert.equal((await q('select licensed_users,billing_tier from workspaces where id=$1',[w]))[0].licensed_users,14);
  await db.exec('set role service_role');const lease=(await q('select claim_checkout_session($1,false) r',[w]))[0].r;assert.ok(lease.checkout_lock);await assert.rejects(q('select claim_checkout_session($1,false)',[w]),/already being prepared/);
  await db.exec('reset role');await q('update workspace_billing set checkout_lock_until=now()-interval \'1 second\' where workspace_id=$1',[w]);await db.exec('set role service_role');assert.ok((await q('select claim_checkout_session($1,false) r',[w]))[0].r.checkout_lock);
 }finally{await db.close();}
});
