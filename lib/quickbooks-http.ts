import {randomUUID} from 'node:crypto';

export type QbRequestContext={environment:'sandbox'|'production';operation:string;workspaceId?:string;userId?:string};
export type QbDiagnostic=QbRequestContext&{reference:string;method:string;status:number;tid:string;code:string;category:string};
export type QbObserver=(event:QbDiagnostic)=>Promise<void>;
export class QbHttpError extends Error{
 status:number;reference:string;tid:string;category:string;
 constructor(status:number,message:string,event:QbDiagnostic){super(`${message} Support reference: ${event.reference}.`);this.status=status;this.reference=event.reference;this.tid=event.tid;this.category=event.category;}
}
export const qbDiscoveryUrl=(environment:'sandbox'|'production')=>`https://developer.api.intuit.com/.well-known/${environment==='sandbox'?'openid_sandbox_configuration':'openid_configuration'}`;
export function validateQbDiscovery(value:unknown){
 if(!value||typeof value!=='object')throw new Error('Invalid QuickBooks discovery document.');
 const d=value as Record<string,unknown>;
 function endpoint(key:string,host:string){if(typeof d[key]!=='string')throw new Error('Incomplete QuickBooks discovery document.');const u=new URL(d[key]);if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||u.port||u.search||u.hash)throw new Error('Untrusted QuickBooks discovery endpoint.');return u.href;}
 return {authorization:endpoint('authorization_endpoint','appcenter.intuit.com'),token:endpoint('token_endpoint','oauth.platform.intuit.com'),revoke:endpoint('revocation_endpoint','developer.api.intuit.com')};
}
const oauthCodes=new Set(['invalid_grant','invalid_client','invalid_request','unauthorized_client','unsupported_grant_type','invalid_scope','access_denied']);
function faultCode(body:unknown){if(!body||typeof body!=='object')return '';const data=body as {error?:unknown;Fault?:{Error?:{code?:unknown}[]}};if(typeof data.error==='string'&&oauthCodes.has(data.error))return data.error;const code=data.Fault?.Error?.[0]?.code;return typeof code==='string'&&/^\d{1,12}$/.test(code)?code:'';}
async function observeSafely(observer:QbObserver,event:QbDiagnostic){try{await observer(event);}catch{console.warn('QuickBooks diagnostic storage unavailable',{reference:event.reference,status:event.status,category:event.category,operation:event.operation,intuit_tid:event.tid,code:event.code});}}
/** No automatic retries: an uncertain POST must be reconciled before another write. */
export async function qbRequestJson<T>(url:string,init:RequestInit,context:QbRequestContext,observer:QbObserver,fetcher:typeof fetch=fetch,validate?:(body:unknown)=>boolean):Promise<T>{
 const event:QbDiagnostic={...context,reference:randomUUID(),method:init.method||'GET',status:0,tid:'',code:'',category:'network'};
 let response:Response;
 try{response=await fetcher(url,{...init,redirect:'error',signal:init.signal||AbortSignal.timeout(20000)});}catch{await observeSafely(observer,event);throw new QbHttpError(0,'QuickBooks could not be reached. For a sync write, check delivery status before retrying.',event);}
 event.status=response.status;const tid=response.headers.get('intuit_tid')||'';event.tid=/^[a-zA-Z0-9_.:-]{1,128}$/.test(tid)?tid:'';
 let body:unknown;try{body=await response.json();}catch{event.category='invalid_response';await observeSafely(observer,event);throw new QbHttpError(response.status,'QuickBooks returned an unreadable response. Check sync history before retrying.',event);}
 if(!response.ok){event.code=faultCode(body);event.category=[401,403].includes(response.status)||oauthCodes.has(event.code)?'authorization':response.status===429?'rate_limit':response.status>=500?'provider':'validation';await observeSafely(observer,event);const message=event.category==='authorization'?'QuickBooks authorization failed. Reconnect your company.':event.category==='rate_limit'?'QuickBooks rate limit reached. Try again later.':event.category==='provider'?'QuickBooks is temporarily unavailable. Check sync history before retrying.':`QuickBooks rejected the request${event.code?` (code ${event.code})`:''}. Review its fields and mappings.`;throw new QbHttpError(response.status,message,event);}
 if(validate&&!validate(body)){event.category='invalid_response';await observeSafely(observer,event);throw new QbHttpError(response.status,'QuickBooks returned an incomplete or untrusted response.',event);}
 event.category='success';await observeSafely(observer,event);return body as T;
}
