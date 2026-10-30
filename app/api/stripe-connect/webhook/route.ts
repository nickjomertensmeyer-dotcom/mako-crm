import Stripe from 'stripe';
import {billingClient,stripeClient} from '@/lib/billing';
import {connectLive} from '@/lib/stripe-connect';
import {connectPaymentMatches} from '@/lib/stripe-connect-model';
import {boundedBody} from '@/lib/request-body';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.STRIPE_CONNECT_WEBHOOK_SECRET;if(!secret)return new Response(null,{status:503});
 let event:Stripe.Event;
 try{event=stripeClient().webhooks.constructEvent(Buffer.from(await boundedBody(request,1048576)),request.headers.get('stripe-signature')||'',secret);if(event.livemode!==connectLive())throw new Error('Wrong mode');}catch{return new Response(null,{status:400});}
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return Response.json({received:true});
 const session=event.data.object as Stripe.Checkout.Session;
 if(!event.account||!session.metadata?.mako_checkout)return Response.json({received:true});
 const db=billingClient();
 try{
  const result=await db.from('invoice_checkouts').select('*').eq('id',session.metadata.mako_checkout).maybeSingle();
  if(result.error||!result.data)throw new Error('Unknown checkout');const expected=result.data;
  if(expected.account_id!==event.account||expected.live!==event.livemode||expected.session_id!==session.id)throw new Error('Checkout mismatch');
  if(session.payment_status==='paid'){
   if(!connectPaymentMatches({account:expected.account_id,session:expected.session_id,amount:Number(expected.amount_cents),currency:expected.currency,live:expected.live},event,session))throw new Error('Payment mismatch');
   const applied=await db.rpc('settle_invoice_checkout',{checkout:expected.id});if(applied.error)throw applied.error;
  }else{
   const state=event.type==='checkout.session.expired'?'expired':event.type==='checkout.session.async_payment_failed'?'failed':'pending';
   const updated=await db.from('invoice_checkouts').update({state}).eq('id',expected.id).in('state',state==='pending'?['creating','open']:['creating','open','pending']);if(updated.error)throw updated.error;
  }
  return Response.json({received:true});
 }catch{return Response.json({error:'Payment reconciliation needs retry.'},{status:503});}
}
