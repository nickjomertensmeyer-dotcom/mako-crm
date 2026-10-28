import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {accountSettings,validatePreferences} from '../lib/account.ts';
test('account preferences use safe defaults and reject unsupported options',()=>{
  assert.equal(accountSettings({mako_appearance:'invalid',mako_reduce_motion:'true'}).appearance,'light');
  assert.equal(accountSettings({mako_reduce_motion:'true'}).reducedMotion,false);
  const form=new FormData();form.set('appearance','dark');form.set('density','compact');form.set('reducedMotion','on');
  assert.deepEqual(validatePreferences(form),{mako_appearance:'dark',mako_density:'compact',mako_reduce_motion:true});
  form.set('appearance','unsupported');assert.throws(()=>validatePreferences(form),/valid appearance/);
});
test('private profile photos cannot be read, written or deleted by another account',async()=>{
  const db=new PGlite();const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage,auth to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202610280006_profile_photos.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec('set role authenticated');
    await db.query("insert into storage.objects values('profile-photos',$1)",[`${a}/photo.webp`]);
    await assert.rejects(db.query("insert into storage.objects values('profile-photos',$1)",[`${b}/photo.webp`]),/row-level security/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await db.exec('delete from storage.objects');await db.exec('reset role');
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await db.exec('set role anon');await assert.rejects(db.query('select * from storage.objects'),/permission denied/);
  }finally{await db.close();}
});
