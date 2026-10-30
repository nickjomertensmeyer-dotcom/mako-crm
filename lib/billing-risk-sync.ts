import 'server-only';
import type Stripe from 'stripe';
import {billingClient,billingTable,stripeClient} from './billing';
import {resolveBillingRisk} from './billing-risk';
import {syncBilling} from './billing-sync';

export async function syncBillingRisk(event:Stripe.Event){
 const alerts=await resolveBillingRisk(event,stripeClient(),process.env.STRIPE_LIVE_MODE==='true'),db=billingClient();
 for(const alert of alerts){
  const mapping=await db.from(billingTable()).select('workspace_id').eq('stripe_customer_id',alert.stripe_customer_id).maybeSingle();
  if(mapping.error)throw mapping.error;
  // INSERT, never UPSERT: retries cannot clear an owner's review decision.
  const inserted=await db.from('billing_risk_alerts').insert({...alert,workspace_id:mapping.data?.workspace_id||null});
  if(inserted.error&&inserted.error.code!=='23505')throw inserted.error;
 }
 for(const customer of new Set(alerts.map(a=>a.stripe_customer_id)))await syncBilling(customer,event.id);
}
