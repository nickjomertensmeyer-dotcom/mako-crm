import type {PlanId} from './plans.ts';
export type FinInvoice={id:string;status:string;livemode:boolean;customer:string|{id:string};amount_paid:number;currency:string;billing_reason:string;parent?:{subscription_details?:{subscription:string|{id:string}}};lines:{has_more?:boolean;data:{amount:number;period:{start:number;end:number};pricing?:{price_details?:{price:string}}}[]}};
// No credits for a trial's $0 invoice, proration, pending checkout, or an unrelated product.
export function paidFinPeriod(invoice:FinInvoice,live:boolean,prices:Record<PlanId,string|string[]|undefined>,now=Math.floor(Date.now()/1000)){
 if(invoice.status!=='paid'||invoice.livemode!==live||invoice.amount_paid<=0||invoice.currency!=='usd'||!['subscription_create','subscription_cycle'].includes(invoice.billing_reason)||invoice.lines.has_more)return null;
 const subscription=invoice.parent?.subscription_details?.subscription;
 const subscriptionId=typeof subscription==='string'?subscription:subscription?.id;
 if(!subscriptionId)return null;
 const matches=(entry:string|string[]|undefined,price:string|undefined)=>Boolean(price&&entry&&(Array.isArray(entry)?entry.includes(price):entry===price));
 const matching=invoice.lines.data.filter(l=>l.amount>0&&Object.values(prices).some(entry=>matches(entry,l.pricing?.price_details?.price)));
 if(matching.length!==1)return null;
 const line=matching[0],tier=(Object.keys(prices) as PlanId[]).find(t=>matches(prices[t],line.pricing?.price_details?.price));
 if(!tier||!Number.isSafeInteger(line.period.start)||!Number.isSafeInteger(line.period.end)||line.period.end<=now||line.period.start>now||line.period.end<=line.period.start)return null;
 return {tier,subscription:subscriptionId,start:new Date(line.period.start*1000).toISOString(),end:new Date(line.period.end*1000).toISOString()};
}
