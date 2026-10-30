import 'server-only';
import {billingTable,billingClient,stripeRequest} from '@/lib/billing';
import {proEntitlement,type EntitlementSubscription} from '@/lib/billing-security';
import {invoicePaidThrough,type BillingInvoice} from '@/lib/billing-policy';

export async function billingSnapshot(customer:string){
 const all:EntitlementSubscription[]=[];let after='';
 do{
  const page=await stripeRequest<{data:EntitlementSubscription[];has_more:boolean}>(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100&expand[]=data.latest_invoice${after?'&starting_after='+encodeURIComponent(after):''}`);
  all.push(...page.data);after=page.has_more?page.data.at(-1)?.id||'':'';
  if(all.length>1000)throw new Error('Too many subscriptions');
 }while(after);
 const price=process.env.STRIPE_PRO_PRICE_ID!;
 for(const sub of all){
  if(sub.livemode!==(process.env.STRIPE_LIVE_MODE==='true')||!sub.items.data.some(i=>i.price.id===price)||!['past_due','unpaid','canceled'].includes(sub.status))continue;
  // First-class subscription filter prevents another subscription's payment granting access.
  const invoices=await stripeRequest<{data:BillingInvoice[]}>(`invoices?subscription=${encodeURIComponent(sub.id)}&status=paid&limit=100`);
  sub.previousPaidThrough=Math.max(0,...invoices.data.map(invoice=>invoicePaidThrough(invoice,price)));
 }
 return {subscriptions:all,access:proEntitlement(all,price,process.env.STRIPE_LIVE_MODE==='true',process.env.STRIPE_SETUP_PRICE_ID)};
}

export async function syncBilling(customer:string,eventKey:string){
 const db=billingClient(),live=process.env.STRIPE_LIVE_MODE==='true';let token:string|null=null;
 try{
  const claimed=await db.rpc(live?'claim_live_billing_sync':'claim_billing_sync',{customer,event_key:eventKey});
  if(claimed.error)throw claimed.error;token=claimed.data;if(!token)return;
  const {access}=await billingSnapshot(customer);
  const applied=await db.rpc(live?'apply_live_billing_sync':'apply_billing_sync',{customer,event_key:eventKey,token,subscription:access.subscription,new_status:access.status,entitled:access.active,cancel_end:access.cancelAtEnd});
  if(applied.error)throw applied.error;
 }catch(error){
  if(token)await db.from(billingTable()).update({sync_token:null,sync_until:null}).eq('stripe_customer_id',customer).eq('sync_token',token);
  throw error;
 }
}
