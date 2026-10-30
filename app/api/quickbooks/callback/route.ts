import {connectionComingSoon,quickBooksComingSoonMessage} from '@/lib/connections-model';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {connectionContext} from '@/lib/connections';
import {calendarDatabase} from '@/lib/google-calendar';
import {openCalendar} from '@/lib/google-calendar-security';
import {qbConfig,qbExchange,qbRead,sealQb} from '@/lib/quickbooks';
import {quickBooksRealm,quickBooksScope,validQuickBooksState} from '@/lib/quickbooks-model';
export const runtime='nodejs';
export async function GET(request:Request){
 let config;try{config=qbConfig();}catch{return Response.json({error:'QuickBooks application setup is incomplete.'},{status:503});}
 const store=await cookies(),cookie=store.get('mako-quickbooks-oauth')?.value;store.delete({name:'mako-quickbooks-oauth',path:'/api/quickbooks'});
 const finish=(message:string)=>{const url=new URL('/workspace',config.origin);url.search=new URLSearchParams({view:'connections',message}).toString();const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
 if(connectionComingSoon('quickbooks'))return finish(quickBooksComingSoonMessage);
 try{
  const query=new URL(request.url).searchParams;if(!cookie)return finish('QuickBooks connection expired. Start again.');const state=JSON.parse(openCalendar(cookie,config.key,'quickbooks-oauth'));
  if(!validQuickBooksState(state,query.get('state'),config.environment))return finish('QuickBooks connection expired. Start again.');
  const ctx=await connectionContext();if(ctx.user.id!==state.uid||ctx.business.id!==state.wid||ctx.role!=='owner')return finish('Only this workspace’s owner can connect QuickBooks.');
  if(query.has('error'))return finish('QuickBooks connection cancelled. No accounting data was changed.');
  const code=query.get('code'),realmId=query.get('realmId');if(!code||code.length>4096||!quickBooksRealm(realmId))return finish('QuickBooks did not return a valid company authorization.');
  const token=await qbExchange({grant_type:'authorization_code',code,redirect_uri:config.callback},{workspaceId:ctx.business.id,userId:ctx.user.id}),credential={workspaceId:ctx.business.id,userId:ctx.user.id,accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+token.expires_in*1000,realmId,environment:config.environment};
  const info=await qbRead<{CompanyInfo?:{CompanyName?:string}}>(credential,`companyinfo/${realmId}`);
  const {error}=await calendarDatabase().from('app_connections').upsert({workspace_id:ctx.business.id,user_id:ctx.user.id,provider:'quickbooks',credential:sealQb(credential,ctx.business.id,ctx.user.id),scopes:quickBooksScope,account_label:(info.CompanyInfo?.CompanyName||'QuickBooks company').slice(0,160),updated_at:new Date().toISOString(),refresh_lock_token:null,refresh_lock_until:null},{onConflict:'workspace_id,user_id,provider'});
  if(error)throw error;return finish(`QuickBooks ${config.environment==='sandbox'?'sandbox ':''}connected. Accounting data has not been changed.`);
 }catch(error){return finish(error instanceof Error&&error.message.includes('Support reference:')?error.message:'Could not connect QuickBooks. Check your app environment, callback URL, and company access.');}
}
