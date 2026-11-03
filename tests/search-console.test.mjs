import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
import vm from 'node:vm';
import {searchWindow,searchPeriod,searchChange,safeSearchPage,searchScope} from '../lib/search-console-model.ts';
import {sealCalendar,openCalendar} from '../lib/google-calendar-security.ts';
import * as model from '../lib/search-console-model.ts';

async function loadModule(path,dependencies,globals={}){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in dependencies)return dependencies[name];throw new Error('Unexpected dependency: '+name);},Response,URL,URLSearchParams,AbortSignal,Date,...globals});
 return module.exports;
}

test('report periods use complete Pacific dates with equal adjacent comparison windows',()=>{
 const window=searchWindow(7,new Date('2026-11-03T02:00:00Z'));
 assert.deepEqual(window,{start:'2026-10-24',end:'2026-10-30',previousStart:'2026-10-17',previousEnd:'2026-10-23'});
 assert.equal(searchWindow(28,new Date('2026-03-09T06:00:00Z')).end,'2026-03-05');
 assert.equal(searchPeriod('7'),7);assert.equal(searchPeriod('365'),28);assert.equal(searchPeriod(null),28);
 assert.equal(searchChange(10,0),'New activity');assert.equal(searchChange(0,0),'No change');assert.equal(searchChange(3,6),'-50.0%');
});
test('owner reporting uses only read permission; report links cannot lead offsite',()=>{
 assert.equal(searchScope,'https://www.googleapis.com/auth/webmasters.readonly');
 assert.equal(safeSearchPage('https://usemakocrm.com/reviews'),'https://usemakocrm.com/reviews');
 for(const url of ['javascript:alert(1)','https://usemakocrm.com.evil.test/','https://user@evil.test/','http://usemakocrm.com/'])assert.equal(safeSearchPage(url),null);
 const key=Buffer.alloc(32,7),encrypted=sealCalendar('test-refresh-token',key,'owner-search:owner-a:sc-domain:usemakocrm.com');
 assert.equal(openCalendar(encrypted,key,'owner-search:owner-a:sc-domain:usemakocrm.com'),'test-refresh-token');
 assert.throws(()=>openCalendar(encrypted,key,'owner-search:owner-b:sc-domain:usemakocrm.com'));
});
test('Search Console credentials and cached reports are inaccessible to browser database roles',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon, authenticated, service_role;");
  await db.exec(await readFile(new URL('../supabase/migrations/202611020038_owner_search_console.sql',import.meta.url),'utf8'));
  await db.exec("insert into auth.users values ('10000000-0000-4000-8000-000000000001'); set role service_role; insert into public.owner_search_connections(user_id,credential,scopes) values ('10000000-0000-4000-8000-000000000001','encrypted','readonly'); reset role;");
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select credential,report from public.owner_search_connections'),/permission denied/);
   await assert.rejects(db.exec("delete from public.owner_search_connections"),/permission denied/);
   await db.exec('reset role');
  }
  assert.equal((await db.query('select count(*)::int as n from public.owner_search_connections')).rows[0].n,1);
 }finally{await db.close();}
});

test('report loading keeps provider failures distinct from genuine zero search activity',async()=>{
 let rejectQueries=false;
 const requests=[];
 const api=await loadModule('../lib/owner-search-console.ts',{
  'server-only':{},'./supabase/server':{},
  './google-calendar':{calendarConfig:()=>({id:'id',secret:'secret',key:'key',origin:'https://usemakocrm.com'}),googleToken:async()=>({access_token:'test-token'})},
  './google-calendar-security':{openCalendar:()=> 'refresh'},'./search-console-model':model,
 },{fetch:async(url,init)=>{
  requests.push({url,body:init.body?JSON.parse(init.body):null});
  if(url.includes('searchAnalytics')){
   if(rejectQueries)return new Response('{}',{status:403});
   return Response.json({rows:[]});
  }
  if(url.includes('urlInspection'))return Response.json({inspectionResult:{indexStatusResult:{verdict:'PASS',coverageState:'Submitted and indexed'}}});
  return Response.json({sitemap:[{path:'https://usemakocrm.com/sitemap.xml',contents:[{submitted:'4'}],errors:'0',warnings:'0'}]});
 }});
 const empty=await api.loadSearchReport('owner','encrypted',28);
 assert.equal(empty.totals.clicks,0);assert.equal(empty.totals.impressions,0);assert.equal(empty.indexing.verdict,'PASS');assert.equal(empty.sitemaps[0].submitted,4);assert.equal(empty.issues.length,0);
 assert.ok(requests.filter(r=>r.body?.startDate).every(r=>r.body.dataState==='final'&&r.body.type==='web'));
 rejectQueries=true;
 const partial=await api.loadSearchReport('owner','encrypted',28);
 assert.equal(partial.totals,null);assert.equal(partial.queries,null);assert.equal(partial.issues.length,5);assert.equal(partial.indexing.verdict,'PASS');
});

test('owner API rejects visitors and cross-origin mutations before touching credentials',async()=>{
 let ownerCalls=0,dbCalls=0;
 const api=await loadModule('../app/api/owner/search-console/route.ts',{
  'next/headers':{},'node:crypto':{},
  '@/lib/owner-search-console':{searchOwner:async()=>{ownerCalls++;return null;}},
  '@/lib/google-calendar':{calendarDatabase:()=>{dbCalls++;throw new Error('Must not access database');}},
  '@/lib/google-calendar-security':{},'@/lib/search-console-model':model,
 });
 assert.equal((await api.GET(new Request('https://usemakocrm.com/api/owner/search-console'))).status,403);
 const before=ownerCalls;
 assert.equal((await api.POST(new Request('https://usemakocrm.com/api/owner/search-console',{method:'POST',headers:{Origin:'https://evil.test'},body:'{"action":"connect"}'}))).status,403);
 assert.equal(ownerCalls,before);assert.equal(dbCalls,0);
 assert.equal((await api.POST(new Request('https://usemakocrm.com/api/owner/search-console',{method:'POST',headers:{Origin:'https://usemakocrm.com'},body:'{"action":"connect"}'}))).status,403);
});

test('platform admin checks fail closed for ordinary accounts and RPC errors',async()=>{
 let user={id:'ordinary'},admin={data:false,error:null};
 const api=await loadModule('../lib/owner-search-console.ts',{
  'server-only':{},'./supabase/server':{supabase:async()=>({auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>admin})},
  './google-calendar':{},'./google-calendar-security':{},'./search-console-model':model,
 });
 assert.equal(await api.searchOwner(),null);
 admin={data:true,error:new Error('failed')};assert.equal(await api.searchOwner(),null);
 admin={data:true,error:null};assert.equal((await api.searchOwner()).id,'ordinary');
 user=null;assert.equal(await api.searchOwner(),null);
});

test('OAuth callback rejects changed identity and expired state before exchanging a code',async()=>{
 let exchanges=0,state={uid:'original-owner',state:'nonce',verifier:'pkce',expires:Date.now()+60000};
 const api=await loadModule('../app/api/owner/search-console/callback/route.ts',{
  'next/headers':{cookies:async()=>({get:()=>({value:'ciphertext'}),delete:()=>{}})},
  'next/server':{NextResponse:{redirect:url=>new Response(null,{status:307,headers:{location:String(url)}})}},
  '@/lib/owner-search-console':{searchConfig:()=>({key:'key'}),searchOwner:async()=>({id:'different-owner'})},
  '@/lib/google-calendar':{googleToken:async()=>{exchanges++;throw new Error('Should not exchange');}},
  '@/lib/google-calendar-security':{openCalendar:()=>JSON.stringify(state),matchesState:(a,b)=>a===b},
  '@/lib/search-console-model':model,
 });
 const request=new Request('https://usemakocrm.com/api/owner/search-console/callback?state=nonce&code=test');
 assert.match((await api.GET(request)).headers.get('location'),/Sign\+in\+to\+the\+owner/);
 state={...state,expires:Date.now()-1};
 assert.match((await api.GET(request)).headers.get('location'),/expired/);
 assert.equal(exchanges,0);
});
