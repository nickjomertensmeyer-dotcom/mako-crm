import {connectionComingSoon,quickBooksComingSoonMessage} from './connections-model';
import 'server-only';
import {qbRequestJson,qbDiscoveryUrl,validateQbDiscovery,type QbRequestContext} from './quickbooks-http';
import {recordQbDiagnostic} from './quickbooks-observability';
export {QbHttpError as QbWriteError} from './quickbooks-http';
import {randomBytes,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {calendarConfig,calendarDatabase} from './google-calendar';
import {openCalendar,sealCalendar} from './google-calendar-security';
import {connectionAAD} from './connections';
import {quickBooksEnvironment,quickBooksCallback,quickBooksScope,quickBooksRealm} from './quickbooks-model';
type QbCredential={workspaceId?:string;userId?:string;refreshToken:string;accessToken:string;expiresAt:number;realmId:string;environment:'sandbox'|'production'};
type QbToken={access_token:string;refresh_token:string;expires_in:number};
export function qbConfig(){const id=process.env.QUICKBOOKS_CLIENT_ID,secret=process.env.QUICKBOOKS_CLIENT_SECRET,environment=quickBooksEnvironment(process.env.QUICKBOOKS_ENVIRONMENT);if(!id||!secret)throw new Error('QuickBooks application setup is not finished.');const shared=calendarConfig();return {...shared,qbId:id,qbSecret:secret,environment,callback:quickBooksCallback(shared.origin)};}
export function qbReady(){return Boolean(process.env.QUICKBOOKS_CLIENT_ID&&process.env.QUICKBOOKS_CLIENT_SECRET&&['sandbox','production'].includes(process.env.QUICKBOOKS_ENVIRONMENT||''));}
const discoveryCache=new Map<string,{expires:number;value:Promise<ReturnType<typeof validateQbDiscovery>>}>();
export async function qbDiscovery(environment:'sandbox'|'production',scope:Pick<QbRequestContext,'workspaceId'|'userId'>={}){
 const cached=discoveryCache.get(environment);if(cached&&cached.expires>Date.now())return cached.value;
 const value=qbRequestJson<unknown>(qbDiscoveryUrl(environment),{headers:{Accept:'application/json'},cache:'no-store'},{...scope,environment,operation:'oauth.discovery'},recordQbDiagnostic,fetch,body=>{try{validateQbDiscovery(body);return true;}catch{return false;}}).then(validateQbDiscovery).catch(error=>{discoveryCache.delete(environment);throw error;});
 discoveryCache.set(environment,{expires:Date.now()+3600000,value});return value;
}
export async function qbExchange(body:Record<string,string>,scope:Pick<QbRequestContext,'workspaceId'|'userId'>={}){
 const config=qbConfig(),discovery=await qbDiscovery(config.environment,scope);
 return qbRequestJson<QbToken>(discovery.token,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${config.qbId}:${config.qbSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(body),cache:'no-store'},{...scope,environment:config.environment,operation:body.grant_type==='refresh_token'?'oauth.refresh':'oauth.exchange'},recordQbDiagnostic,fetch,result=>{const r=result as QbToken;return Boolean(r&&typeof r.access_token==='string'&&r.access_token.length&&typeof r.refresh_token==='string'&&r.refresh_token.length&&Number.isFinite(r.expires_in)&&r.expires_in>0);});
}
export async function startQuickBooks(wid:string,uid:string){
 if(connectionComingSoon('quickbooks'))throw new Error(quickBooksComingSoonMessage);
 const config=qbConfig(),state=randomBytes(32).toString('base64url');(await cookies()).set('mako-quickbooks-oauth',sealCalendar(JSON.stringify({wid,uid,state,environment:config.environment,expires:Date.now()+600000}),config.key,'quickbooks-oauth'),{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/quickbooks',maxAge:600});
 const discovery=await qbDiscovery(config.environment,{workspaceId:wid,userId:uid}),url=new URL(discovery.authorization);url.search=new URLSearchParams({client_id:config.qbId,scope:quickBooksScope,redirect_uri:config.callback,response_type:'code',state}).toString();return url.href;
}
export function sealQb(value:QbCredential,wid:string,uid:string){return sealCalendar(JSON.stringify(value),calendarConfig().key,connectionAAD(wid,uid,'quickbooks'));}
export async function qbCredentials(wid:string,uid:string):Promise<QbCredential>{
 const config=qbConfig(),db=calendarDatabase(),query=()=>db.from('app_connections').select('credential').eq('workspace_id',wid).eq('user_id',uid).eq('provider','quickbooks');
 const {data,error}=await query().maybeSingle();if(error||!data)throw new Error('Connect your QuickBooks company first.');
 const credential=JSON.parse(openCalendar(data.credential,config.key,connectionAAD(wid,uid,'quickbooks'))) as QbCredential;
 if(!quickBooksRealm(credential.realmId)||credential.environment!==config.environment)throw new Error('Reconnect QuickBooks in the selected environment.');
 if(credential.expiresAt>Date.now()+60000)return {...credential,workspaceId:wid,userId:uid};
 const claim=randomUUID(),lease=await db.rpc('claim_connection_refresh',{target:wid,member_id:uid,source_name:'quickbooks',claim_token:claim});
 if(lease.error||!lease.data)throw new Error('QuickBooks is refreshing its connection. Please try again shortly.');
 const release=()=>db.from('app_connections').update({refresh_lock_token:null,refresh_lock_until:null}).eq('workspace_id',wid).eq('user_id',uid).eq('provider','quickbooks').eq('refresh_lock_token',claim);
 try{
  const latest=JSON.parse(openCalendar(lease.data,config.key,connectionAAD(wid,uid,'quickbooks'))) as QbCredential;
  if(latest.environment!==config.environment||!quickBooksRealm(latest.realmId))throw new Error('Reconnect QuickBooks.');
  if(latest.expiresAt>Date.now()+60000)return {...latest,workspaceId:wid,userId:uid};
  const token=await qbExchange({grant_type:'refresh_token',refresh_token:latest.refreshToken},{workspaceId:wid,userId:uid}),updated={...latest,accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+token.expires_in*1000};
  const saved=await db.from('app_connections').update({credential:sealQb(updated,wid,uid),updated_at:new Date().toISOString(),refresh_lock_token:null,refresh_lock_until:null}).eq('workspace_id',wid).eq('user_id',uid).eq('provider','quickbooks').eq('refresh_lock_token',claim).select('provider');
  if(saved.error||!saved.data?.length)throw new Error('QuickBooks connection changed during refresh. Please try again.');return {...updated,workspaceId:wid,userId:uid};
 }finally{await release();}
}
export async function qbRead<T>(credential:QbCredential,path:string):Promise<T>{
 const host=credential.environment==='sandbox'?'sandbox-quickbooks.api.intuit.com':'quickbooks.api.intuit.com';
 return qbRequestJson<T>(`https://${host}/v3/company/${credential.realmId}/${path}`,{headers:{Authorization:`Bearer ${credential.accessToken}`,Accept:'application/json'},cache:'no-store'},{environment:credential.environment,workspaceId:credential.workspaceId,userId:credential.userId,operation:path.startsWith('query?')?'accounting.query':`accounting.read.${path.split('/')[0]}`},recordQbDiagnostic);
}
export async function qbWrite<T>(credential:QbCredential,entity:string,payload:unknown,requestId:string):Promise<T>{
 if(!['customer','invoice','payment'].includes(entity))throw new Error('Unsupported accounting operation.');
 const host=credential.environment==='sandbox'?'sandbox-quickbooks.api.intuit.com':'quickbooks.api.intuit.com';
 return qbRequestJson<T>(`https://${host}/v3/company/${credential.realmId}/${entity}?requestid=${encodeURIComponent(requestId)}`,{method:'POST',headers:{Authorization:`Bearer ${credential.accessToken}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'},{environment:credential.environment,workspaceId:credential.workspaceId,userId:credential.userId,operation:`accounting.create.${entity}`},recordQbDiagnostic);
}
