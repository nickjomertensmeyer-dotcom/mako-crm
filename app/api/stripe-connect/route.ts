import {unstable_rethrow} from 'next/navigation';
import {billingClient,billingOrigin} from '@/lib/billing';
import {merchantContext,merchantOnboarding,merchantStatus,connectLive,connectError} from '@/lib/stripe-connect';
import {boundedBody} from '@/lib/request-body';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const ctx=await merchantContext();return json(await merchantStatus(ctx.business.id));}catch(e){unstable_rethrow(e);return json({error:connectError(e)},503);}}
export async function POST(request:Request){
 try{
  const ctx=await merchantContext();if(request.headers.get('origin')!==billingOrigin())return json({error:'Reload Mako and try again.'},403);
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));
  if(body.action==='connect')return json({url:await merchantOnboarding(ctx.business.id,body.country)});
  if(body.action==='disconnect'){
   const db=billingClient();const pending=await db.from('invoice_checkouts').select('id').eq('workspace_id',ctx.business.id).in('state',['creating','open','pending']).limit(1);
   if(pending.error)throw new Error('Could not check pending payments.');if(pending.data?.length)return json({error:'Close open invoice checkouts and wait for pending payments before disconnecting.'},409);
   const result=await db.from('workspace_stripe_connect').update({enabled:false}).eq('workspace_id',ctx.business.id).eq('live',connectLive());if(result.error)throw new Error('Could not disconnect.');
   return json({message:'Stripe invoice payments disabled for this workspace. Your Stripe account and past payments remain. You can reconnect the same account.'});
  }
  return json({error:'Unknown action.'},400);
 }catch(e){unstable_rethrow(e);return json({error:connectError(e)},400);}
}
