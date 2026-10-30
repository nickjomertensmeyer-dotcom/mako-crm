import Stripe from 'stripe';
import {invoicePaidThrough,renewalGraceEnd,type BillingInvoice} from './billing-policy.ts';
export function verifyStripeSignature(body:string,header:string,secret:string,now=Math.floor(Date.now()/1000)){
 const parts=header.split(',').map(p=>p.split('='));const time=parts.find(([k])=>k==='t')?.[1];if(!time||!/^\d+$/.test(time)||Math.abs(now-Number(time))>300)return false;
 try{Stripe.webhooks.constructEvent(body,header,secret,300,undefined,now*1000);return true;}catch{return false;}
}
export type EntitlementSubscription={id:string;status:string;livemode:boolean;cancel_at_period_end:boolean;pause_collection?:unknown;trial_end?:number;latest_invoice:BillingInvoice|string|null;previousPaidThrough?:number;items:{data:{price:{id:string};current_period_end?:number}[]}};
export function proEntitlement(subscriptions:EntitlementSubscription[],price:string,live:boolean,setupPrice?:string,now=Math.floor(Date.now()/1000)){
 const matching=subscriptions.filter(s=>s.livemode===live&&s.items.data.some(i=>i.price.id===price));
 const evaluated=matching.map(s=>{
  const invoice=typeof s.latest_invoice==='object'?s.latest_invoice:null;
  const paidThrough=Math.max(invoicePaidThrough(invoice,price),s.previousPaidThrough||0);
  const graceEnd=['past_due','unpaid'].includes(s.status)&&!s.pause_collection?renewalGraceEnd(invoice,s.previousPaidThrough||0,price):0;
  const paid=!s.pause_collection&&invoice?.status==='paid'&&(s.status==='active'||(s.status==='trialing'&&(s.trial_end||0)>now&&Boolean(setupPrice)&&invoice.currency==='usd'&&(invoice.amount_paid||0)>=20000&&invoice.lines?.data.some(line=>line.pricing?.price_details?.price===setupPrice&&line.amount>=20000)));
  // Cancellation/refunds do not remove the remainder of an already-paid period.
  const retained=!s.pause_collection&&s.status==='canceled'&&paidThrough>now;
  return {s,active:Boolean(paid||retained||graceEnd>now),paidThrough,graceEnd};
 });
 const chosen=evaluated.find(x=>x.active)||evaluated.find(x=>!['canceled','incomplete_expired'].includes(x.s.status))||evaluated[0];
 return {subscription:chosen?.s.id||null,status:chosen?.s.status||'none',active:Boolean(chosen?.active),cancelAtEnd:Boolean(chosen?.s.cancel_at_period_end),paidThrough:chosen?.paidThrough||0,graceEnd:chosen?.graceEnd||0};
}
