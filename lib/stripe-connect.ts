import 'server-only';
import {billingClient,billingOrigin,stripeClient} from './billing';
import {connectionContext} from './connections';
import {connectAccountParameters} from './stripe-connect-model';

export function connectReady(){return process.env.STRIPE_CONNECT_ENABLED==='true'&&Boolean(process.env.STRIPE_SECRET_KEY&&process.env.SUPABASE_SECRET_KEY&&process.env.NEXT_PUBLIC_SITE_URL);}
export function connectLive(){
 const live=process.env.STRIPE_LIVE_MODE==='true';
 if(!process.env.STRIPE_SECRET_KEY?.startsWith(live?'rk_live_':'rk_test_'))throw new Error('Stripe environment configuration needs attention.');
 return live;
}
export async function merchantContext(){
 const ctx=await connectionContext();
 if(ctx.role!=='owner')throw new Error('Only the workspace owner can manage invoice payments.');
 if(!connectReady())throw new Error('Stripe invoice payments are not configured yet.');
 return ctx;
}
export async function merchantRecord(workspaceId:string){
 const result=await billingClient().from('workspace_stripe_connect').select('*').eq('workspace_id',workspaceId).eq('live',connectLive()).maybeSingle();
 if(result.error)throw new Error('Stripe connections need the database update.');return result.data;
}
export async function merchantStatus(workspaceId:string){
 const saved=await merchantRecord(workspaceId);
 if(!saved?.account_id||!saved.enabled)return {connected:false,ready:false,label:'Not connected'};
 const account=await stripeClient().v2.core.accounts.retrieve(saved.account_id,{include:['configuration.merchant','requirements']});
 const ready=account.configuration?.merchant?.capabilities?.card_payments?.status==='active';
 return {connected:true,ready,label:ready?'Ready to accept payments':'Finish Stripe setup to accept payments'};
}
export async function merchantOnboarding(workspaceId:string,country?:string){
 const db=billingClient(),live=connectLive();
 const seed=await db.from('workspace_stripe_connect').upsert({workspace_id:workspaceId,live},{onConflict:'workspace_id,live',ignoreDuplicates:true});
 if(seed.error)throw new Error('Could not prepare Stripe connection.');
 const saved=await merchantRecord(workspaceId);if(!saved)throw new Error('Could not load Stripe connection.');
 let accountId=saved.account_id;
 if(!accountId){
  // Never blindly retry an orphaned create after Stripe's idempotency retention period.
  if(Date.now()-new Date(saved.created_at).getTime()>23*3600000)throw new Error('Mako must review this unfinished connection before retrying.');
  const account=await stripeClient().v2.core.accounts.create(connectAccountParameters(workspaceId,country||''),{idempotencyKey:`mako-merchant-${saved.attempt}`});accountId=account.id;
  const stored=await db.from('workspace_stripe_connect').update({account_id:accountId}).eq('workspace_id',workspaceId).eq('live',live);
  if(stored.error)throw new Error('Could not save Stripe connection. Retry to recover it.');
 }
 const origin=billingOrigin();
 const link=await stripeClient().v2.core.accountLinks.create({account:accountId,use_case:{type:'account_onboarding',account_onboarding:{refresh_url:`${origin}/api/stripe-connect/refresh`,return_url:`${origin}/workspace?view=connections&message=Stripe%20setup%20returned.%20Refresh%20to%20check%20payment%20readiness.`}}});
 const enabled=await db.from('workspace_stripe_connect').update({enabled:true}).eq('workspace_id',workspaceId).eq('live',live);if(enabled.error)throw new Error('Could not enable connection.');
 return link.url;
}
export function connectError(error:unknown){
 const e=error as {type?:string;code?:string;message?:string};
 if(e.type){console.error('Stripe Connect request failed',{type:e.type,code:e.code});return 'Stripe could not complete this action. Mako needs to check the connection permissions and configuration.';}
 return e.message||'Could not complete this request.';
}
