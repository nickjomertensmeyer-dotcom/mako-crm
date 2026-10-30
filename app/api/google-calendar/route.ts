import {deleteGoogleEvent,CalendarDeleteError} from '@/lib/google-calendar-delete';
import {cookies} from 'next/headers';
import {createHash,randomBytes} from 'node:crypto';
import {workspace} from '@/lib/workspace';
import {calendarConfig,calendarDatabase,googleToken,googleCalendar,GoogleCalendarError} from '@/lib/google-calendar';
import {calendarScope,canReadGoogleCalendar,canEditGoogleCalendar,sealCalendar,openCalendar,validTimeZone} from '@/lib/google-calendar-security';
import {calendarWindow,normalizeGoogleEvent,type GoogleApiEvent} from '@/lib/google-calendar-model';
export const runtime='nodejs';
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
type GoogleCalendarOption={id:string;summary?:string;primary?:boolean;accessRole?:string};
async function listCalendars(token:string){
 const calendars:GoogleCalendarOption[]=[];let next='';
 do{const query=new URLSearchParams({maxResults:'250',fields:'items(id,summary,primary,accessRole),nextPageToken',...(next?{pageToken:next}:{})});
  const page=await googleCalendar<{items?:GoogleCalendarOption[];nextPageToken?:string}>(token,`users/me/calendarList?${query}`);calendars.push(...(page.items||[]));next=page.nextPageToken||'';
  if(calendars.length>2500)throw new Error('Too many calendars');
 }while(next);
 return calendars.filter(c=>['reader','writer','owner','writerWithoutPrivateAccess'].includes(c.accessRole||'')).map(c=>({id:c.primary?'primary':c.id,name:c.summary||'Google calendar',canDelete:['writer','owner'].includes(c.accessRole||'')}));
}
async function context(){const ctx=await workspace();if(ctx.business.archived_at||ctx.business.status!=='active'||!['pro','custom'].includes(ctx.business.plan)||!ctx.business.modules.includes('schedule'))return null;return ctx;}
async function accessToken(connection:{refresh_token:string},wid:string,uid:string){const config=calendarConfig();const token=await googleToken({client_id:config.id,client_secret:config.secret,grant_type:'refresh_token',refresh_token:openCalendar(connection.refresh_token,config.key,`${wid}:${uid}`)});return token.access_token;}
export async function GET(request:Request){
 const ctx=await context();if(!ctx)return json({error:'Activate Pro and enable Schedule to connect Google Calendar.'},403);
 try{
  calendarConfig();const {data,error}=await calendarDatabase().from('google_calendar_connections').select('refresh_token,scopes,import_calendar_id,time_zone').eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id).maybeSingle();
  if(error)return json({error:'Google Calendar needs a database update. Contact Mako to finish setup.'},503);
  const params=new URL(request.url).searchParams;
  if(!data||!canReadGoogleCalendar(data.scopes))return json({connected:Boolean(data),needsReconnect:Boolean(data),events:[],calendars:[]});
  const token=await accessToken(data,ctx.business.id,ctx.user.id);
  if(params.get('mode')!=='events')return json({connected:true,needsReconnect:false,canDelete:canEditGoogleCalendar(data.scopes),timeZone:data.time_zone,calendarId:data.import_calendar_id,calendars:await listCalendars(token)});
  let range;try{range=calendarWindow(params.get('month')||'');}catch{return json({error:'Choose a valid calendar month.'},400);}
  const events:GoogleApiEvent[]=[];let next='';
  do{
   const query=new URLSearchParams({...range,singleEvents:'true',orderBy:'startTime',maxResults:'250',timeZone:data.time_zone,fields:'items(id,summary,status,htmlLink,start,end,etag,recurringEventId,locked),nextPageToken',...(next?{pageToken:next}:{})});
   const page=await googleCalendar<{items?:GoogleApiEvent[];nextPageToken?:string}>(token,`calendars/${encodeURIComponent(data.import_calendar_id)}/events?${query}`);events.push(...(page.items||[]));next=page.nextPageToken||'';
   if(events.length>2000||next&&events.length>=2000)return json({error:'This six-week calendar view exceeds 2,000 Google events. Select a less busy calendar.'},422);
  }while(next);
  return json({connected:true,needsReconnect:false,canDelete:canEditGoogleCalendar(data.scopes)&&(await listCalendars(token)).some(c=>c.id===data.import_calendar_id&&c.canDelete),calendarId:data.import_calendar_id,timeZone:data.time_zone,events:events.map(event=>normalizeGoogleEvent(event,data.time_zone)).filter(Boolean),refreshedAt:new Date().toISOString()});
 }catch{return json({error:'Could not read Google Calendar. Try Refresh, or reconnect if Google permission has expired.'},502);}
}
export async function POST(request:Request){
 const ctx=await context();if(!ctx)return json({error:'Activate Pro and enable Schedule to connect Google Calendar.'},403);
 let config;try{config=calendarConfig();}catch{return json({error:'Google Calendar setup is not finished. Contact Mako.'},503);}
 if(request.headers.get('origin')!==config.origin)return json({error:'Please reload Mako and try again.'},403);
 let body;try{if(Number(request.headers.get('content-length'))>4096)return json({error:'Invalid request.'},400);body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);}catch{return json({error:'Invalid request.'},400);}
 const db=calendarDatabase(),wid=ctx.business.id,uid=ctx.user.id;
 if(body.action==='connect'){
  if(!validTimeZone(body.timeZone))return json({error:'Choose a valid calendar time zone.'},400);
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const store=await cookies();store.delete({name:'mako-connections-oauth',path:'/api/google-calendar'});store.set('mako-calendar-oauth',sealCalendar(JSON.stringify({state,verifier,wid,uid,zone:body.timeZone,expires:Date.now()+600000}),config.key,'oauth'),{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/google-calendar',maxAge:600});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.id,redirect_uri:config.redirect,response_type:'code',scope:calendarScope,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return json({url:url.toString()});
 }
 if(body.action==='disconnect'){
  const {error}=await db.from('google_calendar_connections').delete().eq('workspace_id',wid).eq('user_id',uid);if(error)return json({error:'Could not disconnect. Try again.'},503);
  return json({connected:false,needsReconnect:false,calendars:[],message:'Disconnected. Google events were not changed. Remove Mako in your Google account settings to revoke its permission.'});
 }
 if(body.action==='delete'){
  if(typeof body.eventId!=='string'||typeof body.etag!=='string'||typeof body.calendarId!=='string'||!['occurrence','series'].includes(body.scope))return json({error:'Choose a valid event and deletion option.'},400);
  const {data,error}=await db.from('google_calendar_connections').select('refresh_token,scopes,import_calendar_id').eq('workspace_id',wid).eq('user_id',uid).maybeSingle();
  if(error)return json({error:'Could not check your calendar connection. Try again.'},503);
  if(!data||!canEditGoogleCalendar(data.scopes))return json({error:'Reconnect Google Calendar to allow event deletion.'},403);
  if(body.calendarId!==data.import_calendar_id)return json({error:'The selected calendar changed. Refresh before deleting.'},409);
  try{
   const token=await accessToken(data,wid,uid),calendars=await listCalendars(token);
   if(!calendars.some(c=>c.id===data.import_calendar_id&&c.canDelete))return json({error:'You only have read access to this Google calendar.'},403);
   await deleteGoogleEvent({id:body.eventId,etag:body.etag,scope:body.scope},(path,method,etag)=>googleCalendar(token,`calendars/${encodeURIComponent(data.import_calendar_id)}/${path}`,method,undefined,etag));
   return json({message:body.scope==='series'?'Google event series deleted.':'Google event deleted.'});
  }catch(error){
   if(error instanceof CalendarDeleteError)return json({error:error.message},error.status);
   if(error instanceof GoogleCalendarError){
    if([404,410].includes(error.status))return json({message:'This event is already unavailable. Refreshing your calendar.'});
    if(error.status===412)return json({error:'This event changed in Google. Refresh and review it before deleting.'},409);
    if(error.status===403)return json({error:'Google did not allow deletion of this event. Check your calendar permissions.'},403);
   }
   return json({error:'Could not confirm deletion in Google. Refresh to check the event before trying again.'},502);
  }
 }
 if(body.action==='select'){
  if(typeof body.calendarId!=='string'||body.calendarId.length>1024)return json({error:'Choose a calendar.'},400);
  const {data,error}=await db.from('google_calendar_connections').select('refresh_token,scopes').eq('workspace_id',wid).eq('user_id',uid).maybeSingle();
  if(error||!data||!canReadGoogleCalendar(data.scopes))return json({error:'Reconnect Google Calendar to allow read-only access.'},409);
  try{
   const calendars=await listCalendars(await accessToken(data,wid,uid));if(!calendars.some(c=>c.id===body.calendarId))return json({error:'This calendar is not available to your Google account.'},403);
   const updated=await db.from('google_calendar_connections').update({import_calendar_id:body.calendarId}).eq('workspace_id',wid).eq('user_id',uid);if(updated.error)throw updated.error;
   return json({calendarId:body.calendarId,message:'Calendar selected. Google events will appear below.'});
  }catch{return json({error:'Could not select that calendar. Reconnect Google and try again.'},502);}
 }
 return json({error:'Choose Connect, Refresh, or Disconnect. Mako no longer exports events to Google.'},400);
}

