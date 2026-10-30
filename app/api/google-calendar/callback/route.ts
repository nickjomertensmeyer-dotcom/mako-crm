import {cookies} from 'next/headers';
import {finishGoogleConnection} from '@/lib/connections';
import {NextResponse} from 'next/server';
import {workspace} from '@/lib/workspace';
import {calendarConfig,calendarDatabase,googleToken} from '@/lib/google-calendar';
import {canReadGoogleCalendar,sealCalendar,openCalendar,matchesState,validTimeZone} from '@/lib/google-calendar-security';
export const runtime='nodejs';
export async function GET(request:Request){
 let config;try{config=calendarConfig();}catch{return Response.json({error:'Google Calendar setup is not finished. Return to Mako and contact support.'},{status:503,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
 const store=await cookies(),saved=store.get('mako-calendar-oauth')?.value;
 const appConnection=store.get('mako-connections-oauth')?.value;
 if(appConnection)return finishGoogleConnection(request,appConnection);
 store.set('mako-calendar-oauth','',{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/google-calendar',maxAge:0});
 const finish=(message:string)=>{const url=new URL('/workspace',config.origin);url.search=new URLSearchParams({view:'schedule',message}).toString();const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
 try{
  const query=new URL(request.url).searchParams;
  if(!saved)return finish('Google Calendar connection expired. Please try again.');
  const state=JSON.parse(openCalendar(saved,config.key,'oauth'));
  if(state.expires<Date.now()||!matchesState(state.state,query.get('state')||'')||!validTimeZone(state.zone))return finish('Google Calendar connection expired. Please try again.');
  const {business,user}=await workspace();
  if(user.id!==state.uid||business.id!==state.wid||business.archived_at||business.status!=='active'||!['pro','custom'].includes(business.plan)||!business.modules.includes('schedule'))return finish('This account cannot connect that workspace.');
  if(query.has('error'))return finish('Google Calendar was not connected. You can try again whenever you’re ready.');
  const code=query.get('code');if(!code||code.length>4096)return finish('Google did not return a valid connection code.');
  const token=await googleToken({client_id:config.id,client_secret:config.secret,grant_type:'authorization_code',redirect_uri:config.redirect,code,code_verifier:state.verifier});
  if(!token.refresh_token||!canReadGoogleCalendar(token.scope||''))return finish('Google Calendar read-only permission was not granted. Please reconnect and allow the requested access.');
  const {error}=await calendarDatabase().from('google_calendar_connections').upsert({workspace_id:business.id,user_id:user.id,refresh_token:sealCalendar(token.refresh_token,config.key,`${business.id}:${user.id}`),time_zone:state.zone,scopes:token.scope,import_calendar_id:'primary',last_synced_at:null},{onConflict:'workspace_id,user_id'});
  if(error)return finish('Could not save this connection. If already connected, disconnect before changing accounts. Otherwise contact Mako.');
  return finish('Google Calendar connected. Your Google events appear in Mako Schedule. Choose a calendar above the agenda.');
 }catch{return finish('Google Calendar could not connect. Please try again or contact Mako.');}
}
