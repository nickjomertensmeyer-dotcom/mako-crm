import {billingTable,billingClient,stripeRequest} from '@/lib/billing';
import {verifyStripeSignature,proEntitlement,type EntitlementSubscription} from '@/lib/billing-security';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.STRIPE_WEBHOOK_SECRET,price=process.env.STRIPE_PRO_PRICE_ID;
 if(!secret||!price||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SECRET_KEY)return Response.json({error:'Billing not configured'},{status:503});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
 const body=Buffer.concat(chunks).toString('utf8');if(!verifyStripeSignature(body,request.headers.get('stripe-signature')||'',secret))return Response.json({error:'Invalid signature'},{status:400});
 let event;try{event=JSON.parse(body);}catch{return new Response(null,{status:400});}
 const live=process.env.STRIPE_LIVE_MODE==='true';if(event.livemode!==live)return Response.json({error:'Wrong billing environment'},{status:400});
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type))return Response.json({received:true});
 const customer=event.data?.object?.customer;if(typeof customer!=='string'||!/^cus_[A-Za-z0-9]+$/.test(customer)||typeof event.id!=='string')return new Response(null,{status:400});
 const db=billingClient();let token:string|null=null;
 try{
  const claimed=await db.rpc(live?'claim_live_billing_sync':'claim_billing_sync',{customer,event_key:event.id});if(claimed.error)throw claimed.error;token=claimed.data;if(!token)return Response.json({received:true});
  // Serialize per customer, then retrieve current Stripe state: late events cannot restore old access.
  const all:EntitlementSubscription[]=[];let after='';
  do{const page=await stripeRequest<{data:EntitlementSubscription[];has_more:boolean}>(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100&expand[]=data.latest_invoice${after?'&starting_after='+encodeURIComponent(after):''}`);all.push(...page.data);after=page.has_more?page.data.at(-1)?.id||'':'';if(all.length>1000)throw new Error('Too many subscriptions');}while(after);
  const access=proEntitlement(all,price,live,process.env.STRIPE_SETUP_PRICE_ID);const applied=await db.rpc(live?'apply_live_billing_sync':'apply_billing_sync',{customer,event_key:event.id,token,subscription:access.subscription,new_status:access.status,entitled:access.active,cancel_end:access.cancelAtEnd});if(applied.error)throw applied.error;
  return Response.json({received:true});
 }catch{if(token)await db.from(billingTable()).update({sync_token:null,sync_until:null}).eq('stripe_customer_id',customer).eq('sync_token',token);return Response.json({error:'Subscription sync failed; retry required'},{status:503});}
}
