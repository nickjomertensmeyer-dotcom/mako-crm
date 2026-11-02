import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
test('reviews: consent, isolation, moderation, withdrawal and low ratings',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users values($1),($2),($3)',[A,B,C]);
 for(const name of ['202610280001_foundation','202611010031_reviews'])await db.exec(await readFile(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 await as(A);await db.query("select create_workspace('Reviews test','Other',array['customers'])");
 const submit=(rating=4,consent=true)=>db.query("select submit_review('Alex','Example Co',$1,'Useful customer boards and helpful notes.',$2)",[rating,consent]);
 await assert.rejects(submit(4,false),/permission/);await assert.rejects(submit(6),/check constraint/);
 await submit();const id=(await db.query('select id from customer_reviews')).rows[0].id;
 await assert.rejects(submit(),/wait/);
 assert.equal((await db.query('select * from public_reviews()')).rows.length,0);
 await as(B);assert.equal((await db.query('select * from customer_reviews')).rows.length,0);
 await assert.rejects(submit(),/workspace account/);
 await assert.rejects(db.query("select set_review_status($1,'approved')",[id]),/permission/);
 await assert.rejects(db.query("select set_review_status($1,'withdrawn')",[id]),/unavailable/);
 await db.exec('reset role');await db.query('insert into platform_admins values($1)',[C]);await as(C);
 await db.query("select set_review_status($1,'approved')",[id]);
 await db.exec('reset role;set role anon');
 const published=(await db.query('select * from public_reviews()')).rows;assert.equal(published.length,1);assert.equal('author_id' in published[0],false);
 await assert.rejects(db.query('select * from customer_reviews'),/permission/);
 await as(A);await db.query("select set_review_status($1,'withdrawn')",[id]);assert.equal((await db.query('select * from public_reviews()')).rows.length,0);
 await as(C);await assert.rejects(db.query("select set_review_status($1,'approved')",[id]),/unavailable/);
 await db.exec("reset role;update customer_reviews set updated_at=now()-interval '2 minutes'");await as(A);await submit(1);
 assert.equal((await db.query('select * from customer_reviews')).rows.length,1);assert.equal((await db.query('select status from customer_reviews')).rows[0].status,'pending');
 await as(C);await db.query("select set_review_status($1,'approved')",[id]);assert.equal((await db.query('select rating from public_reviews()')).rows[0].rating,1);
 }finally{await db.close();}
});
