import {syncBilling} from '@/lib/billing-sync';
import {verifyStripeSignature} from '@/lib/billing-security';
import {riskEventTypes} from '@/lib/billing-risk';
import {syncBillingRisk} from '@/lib/billing-risk-sync';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.STRIPE_WEBHOOK_SECRET,price=process.env.STRIPE_PRO_PRICE_ID;
 if(!secret||!price||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SECRET_KEY)return Response.json({error:'Billing not configured'},{status:503});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
 const body=Buffer.concat(chunks).toString('utf8');if(!verifyStripeSignature(body,request.headers.get('stripe-signature')||'',secret))return Response.json({error:'Invalid signature'},{status:400});
 let event;try{event=JSON.parse(body);}catch{return new Response(null,{status:400});}
 const live=process.env.STRIPE_LIVE_MODE==='true';if(event.livemode!==live)return Response.json({error:'Wrong billing environment'},{status:400});
 if(event.account)return Response.json({error:'Connected-account event on subscription endpoint'},{status:400});
 if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]+$/.test(event.id)||!Number.isFinite(event.created))return new Response(null,{status:400});
 if(riskEventTypes.some(t=>t===event.type)){
  try{await syncBillingRisk(event);return Response.json({received:true});}
  catch{return Response.json({error:'Billing alert sync failed; retry required'},{status:503});}
 }
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type))return Response.json({received:true});
 const customer=event.data?.object?.customer;if(typeof customer!=='string'||!/^cus_[A-Za-z0-9]+$/.test(customer)||typeof event.id!=='string')return new Response(null,{status:400});
 try{await syncBilling(customer,event.id);return Response.json({received:true});}
 catch{return Response.json({error:'Subscription sync failed; retry required'},{status:503});}
}
