import 'server-only';
import {cookies} from 'next/headers';
import {createHash,randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {workspace} from './workspace';
import {calendarConfig,calendarDatabase,googleToken} from './google-calendar';
import {openCalendar,sealCalendar,matchesState} from './google-calendar-security';
import {appDefinition} from './connections-model';
export async function connectionContext(requireActive=true){const ctx=await workspace();if(requireActive&&(ctx.business.archived_at||ctx.business.status!=='active'||!['pro','custom'].includes(ctx.business.plan)))throw new Error('Activate your plan to use connections.');return ctx;}
export function connectionAAD(wid:string,uid:string,provider:string){return `connection:${wid}:${uid}:${provider}`;}
export async function connectionToken(provider:string,wid:string,uid:string){
 const config=calendarConfig();const {data,error}=await calendarDatabase().from('app_connections').select('credential,scopes').eq('workspace_id',wid).eq('user_id',uid).eq('provider',provider).maybeSingle();
 const definition=appDefinition(provider);if(error||!data||!definition?.scope||!data.scopes.split(' ').includes(definition.scope))throw new Error('Connect this app first, or reconnect to restore permission.');
 const token=await googleToken({client_id:config.id,client_secret:config.secret,grant_type:'refresh_token',refresh_token:openCalendar(data.credential,config.key,connectionAAD(wid,uid,provider))});return token.access_token;
}
export async function startGoogleConnection(provider:string,wid:string,uid:string){
 const definition=appDefinition(provider);if(!definition?.scope)throw new Error('This provider needs application setup.');
 const config=calendarConfig(),state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const store=await cookies();store.delete({name:'mako-calendar-oauth',path:'/api/google-calendar'});
 store.set('mako-connections-oauth',sealCalendar(JSON.stringify({provider,wid,uid,state,verifier,expires:Date.now()+600000}),config.key,'connections-oauth'),{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/google-calendar',maxAge:600});
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.id,redirect_uri:config.redirect,response_type:'code',scope:definition.scope,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return url.href;
}
export async function finishGoogleConnection(request:Request,saved:string){
 const config=calendarConfig(),store=await cookies();store.set('mako-connections-oauth','',{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/google-calendar',maxAge:0});
 const finish=(message:string)=>{const url=new URL('/workspace',config.origin);url.search=new URLSearchParams({view:'connections',message}).toString();const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
 try{
  const query=new URL(request.url).searchParams,state=JSON.parse(openCalendar(saved,config.key,'connections-oauth'));
  if(state.expires<Date.now()||!matchesState(state.state,query.get('state')||''))return finish('Connection expired. Please try again.');
  const ctx=await connectionContext();if(ctx.business.id!==state.wid||ctx.user.id!==state.uid)return finish('Sign in to the workspace that started this connection.');
  if(query.has('error'))return finish('Connection cancelled. Your existing connections are unchanged.');
  const definition=appDefinition(state.provider),code=query.get('code');if(!definition?.scope||!code||code.length>4096)return finish('Invalid connection response.');
  const token=await googleToken({client_id:config.id,client_secret:config.secret,grant_type:'authorization_code',redirect_uri:config.redirect,code,code_verifier:state.verifier});
  if(!token.refresh_token||!token.scope?.split(' ').includes(definition.scope))return finish('The requested permission was not granted. Please reconnect.');
  const {error}=await calendarDatabase().from('app_connections').upsert({workspace_id:state.wid,user_id:state.uid,provider:state.provider,credential:sealCalendar(token.refresh_token,config.key,connectionAAD(state.wid,state.uid,state.provider)),scopes:token.scope,updated_at:new Date().toISOString()},{onConflict:'workspace_id,user_id,provider'});
  if(error)return finish('Could not save the connection. Mako needs to check the connections database update.');
  return finish(`${definition.name} connected. Choose an action below to use it.`);
 }catch{return finish('Could not connect this app. Please try again or contact Mako.');}
}
export async function providerJson<T>(url:string,token:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(response.status===403?'The provider denied access. Check app permissions and API setup.':response.status===429?'The provider is busy. Please wait and try again.':'The provider could not complete this request. Reconnect if your permission expired.');return response.json();
}
