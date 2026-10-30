import type Stripe from 'stripe';

export const riskEventTypes=['charge.refunded','charge.dispute.created','charge.dispute.closed','radar.early_fraud_warning.created'] as const;
export type BillingRiskAlert={event_id:string;event_type:string;livemode:boolean;stripe_customer_id:string;subscription_id:string|null;invoice_id:string|null;charge_id:string;object_id:string;amount:number|null;currency:string|null;occurred_at:string;summary:string};
const id=(value:unknown):string|null=>typeof value==='string'?value:value&&typeof value==='object'&&'id' in value&&typeof value.id==='string'?value.id:null;

// Resolve modern InvoicePayment -> Invoice.parent.subscription_details relationships.
// Keep unlinked risk events visible too; a missing mapping must not hide a dispute.
export async function resolveBillingRisk(event:Stripe.Event,stripe:Stripe,live:boolean):Promise<BillingRiskAlert[]>{
 if(event.livemode!==live||event.account)throw new Error('Wrong billing account or environment');
 if(!riskEventTypes.some(t=>t===event.type))return [];
 const obj=event.data.object as Stripe.Charge|Stripe.Dispute|Stripe.Radar.EarlyFraudWarning;
 const chargeId=obj.object==='charge'?obj.id:id(obj.charge);
 if(!chargeId)throw new Error('Missing charge');
 const charge=obj.object==='charge'?obj:await stripe.charges.retrieve(chargeId);
 if(charge.livemode!==live)throw new Error('Wrong charge environment');
 const customer=id(charge.customer);if(!customer)return [];
 const pi=id(charge.payment_intent),links:{invoice:string;subscription:string|null}[]=[];
 if(pi){
  for await(const payment of stripe.invoicePayments.list({payment:{type:'payment_intent',payment_intent:pi},status:'paid',limit:100})){
   const invoiceId=id(payment.invoice);if(!invoiceId)continue;
   const invoice=await stripe.invoices.retrieve(invoiceId);
   if(invoice.livemode!==live||id(invoice.customer)!==customer)throw new Error('Invoice ownership mismatch');
   links.push({invoice:invoice.id,subscription:invoice.parent?.type==='subscription_details'?id(invoice.parent.subscription_details?.subscription):null});
   if(links.length>1000)throw new Error('Too many linked invoices');
  }
 }
 const summary=event.type==='charge.refunded'?(charge.refunded?'Full refund recorded; paid-period access is retained.':'Partial refund recorded; access is unchanged.'):event.type==='charge.dispute.closed'?'Dispute closed. Review the outcome in Stripe.':event.type==='charge.dispute.created'?'Payment disputed. Review evidence and response deadlines in Stripe.':'Potential fraud warning. Review the payment in Stripe; this is not a confirmed fraud finding.';
 const amount=obj.object==='dispute'?obj.amount:event.type==='charge.refunded'?charge.amount_refunded:charge.amount;
 return (links.length?links:[{invoice:null,subscription:null}]).map(link=>({event_id:event.id,event_type:event.type,livemode:live,stripe_customer_id:customer,subscription_id:link.subscription,invoice_id:link.invoice,charge_id:chargeId,object_id:obj.id,amount,currency:charge.currency,occurred_at:new Date(event.created*1000).toISOString(),summary}));
}
