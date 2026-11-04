import 'server-only';
import {billingClient,billingTable,stripeClient} from '@/lib/billing';
import {paidFinPeriod,type FinInvoice} from '@/lib/fin-billing';
import {planPriceId} from '@/lib/plans';
import {proPriceIds} from '@/lib/pro-pricing';
export async function syncFinInvoice(invoiceId:string,customer:string){
 const live=process.env.STRIPE_LIVE_MODE==='true';
 const invoice=await stripeClient().invoices.retrieve(invoiceId) as unknown as FinInvoice;
 const owner=typeof invoice.customer==='string'?invoice.customer:invoice.customer.id;
 if(owner!==customer)throw Error('Fin invoice customer mismatch');
 const period=paidFinPeriod(invoice,live,{starter:planPriceId('starter'),pro:proPriceIds().filter(id=>![planPriceId('starter'),planPriceId('team')].includes(id)),team:planPriceId('team')});
 if(!period)return;
 const {data:billing}=await billingClient().from(billingTable()).select('subscription_id').eq('stripe_customer_id',customer).maybeSingle();
 if(billing?.subscription_id!==period.subscription)return;
 const {error}=await billingClient().rpc('grant_fin_period',{customer,subscription:period.subscription,invoice:invoice.id,tier_name:period.tier,period_start:period.start,period_end:period.end,is_live:live});
 if(error)throw error;
}
export async function reconcileFinCredits(workspaceId:string){
 const {data:b}=await billingClient().from(billingTable()).select('stripe_customer_id,subscription_id').eq('workspace_id',workspaceId).maybeSingle();
 if(!b?.stripe_customer_id||!b.subscription_id)return;
 const invoices=await stripeClient().invoices.list({customer:b.stripe_customer_id,subscription:b.subscription_id,status:'paid',limit:3});
 for(const invoice of invoices.data)await syncFinInvoice(invoice.id,b.stripe_customer_id);
}
