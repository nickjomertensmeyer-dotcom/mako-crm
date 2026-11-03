import {cookies} from 'next/headers';
import {randomBytes,createHash} from 'node:crypto';
import {searchOwner,searchConfig,savedSearch,searchTable,loadSearchReport} from '@/lib/owner-search-console';
import {calendarDatabase} from '@/lib/google-calendar';
import {sealCalendar} from '@/lib/google-calendar-security';
import {searchPeriod,searchScope,searchWindow,type SearchReport} from '@/lib/search-console-model';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const user=await searchOwner();if(!user)return json({error:'Platform owner access required.'},403);
 try{searchConfig();}catch{return json({connected:false,configured:false,databaseReady:false});}
 const saved=await savedSearch(user.id);if(saved.error)return json({connected:false,configured:true,databaseReady:false});
 if(!saved.data)return json({connected:false,configured:true,databaseReady:true});
 const days=searchPeriod(new URL(request.url).searchParams.get('days')),cached=saved.data.report as SearchReport|null;
 if(cached&&cached.days===days&&cached.end===searchWindow(days).end&&Date.now()-Date.parse(cached.fetchedAt)<900000)return json({connected:true,configured:true,databaseReady:true,report:cached});
 try{
  const report=await loadSearchReport(user.id,saved.data.credential,days);
  // Avoid replacing a newer connection if another tab reconnects while loading.
  await calendarDatabase().from(searchTable).update({report}).eq('user_id',user.id).eq('updated_at',saved.data.updated_at);
  return json({connected:true,configured:true,databaseReady:true,report});
 }catch{return json({connected:true,configured:true,databaseReady:true,error:'Could not load Google Search data. Reconnect if permission has expired.'});}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid request origin.'},403);
 const user=await searchOwner();if(!user)return json({error:'Platform owner access required.'},403);
 let action:string;try{action=(await request.json()).action;}catch{return json({error:'Invalid request.'},400);}
 if(action==='disconnect'){
  const {error}=await calendarDatabase().from(searchTable).delete().eq('user_id',user.id);
  return error?json({error:'Could not disconnect. Try again.'},503):json({disconnected:true});
 }
 if(action!=='connect')return json({error:'Unknown action.'},400);
 try{
  const config=searchConfig(),state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  const saved=await savedSearch(user.id);if(saved.error)return json({error:'Search reporting needs its database update.'},503);
  (await cookies()).set('mako-owner-search-oauth',sealCalendar(JSON.stringify({state,verifier,uid:user.id,expires:Date.now()+600000}),config.key,'owner-search-oauth'),{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/owner/search-console',maxAge:600});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.id,redirect_uri:config.redirect,response_type:'code',scope:searchScope,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  return json({url:url.href});
 }catch{return json({error:'Google Search connection setup is not complete.'},503);}
}
