'use server';
import {randomUUID} from 'node:crypto';
import {redirect} from 'next/navigation';
import {workspace} from '@/lib/workspace';
import {billingTable,billingClient,billingOrigin,billingReady,stripeRequest,subscriptions} from '@/lib/billing';
export async function openBilling(form:FormData){
 const {business,role}=await workspace();const action=String(form.get('intent'));let destination='';
 if(role!=='owner'||!['checkout','portal'].includes(action))redirect('/workspace?view=plan&message=Only+the+workspace+owner+can+manage+billing.');
 try{
  if(!billingReady())throw new Error('Not configured');
  const db=billingClient();const loadedBilling=await db.from(billingTable()).select('*').eq('workspace_id',business.id).maybeSingle();let row=loadedBilling.data;if(loadedBilling.error)throw loadedBilling.error;
  if(!row){const inserted=await db.from(billingTable()).upsert({workspace_id:business.id},{onConflict:'workspace_id',ignoreDuplicates:true});if(inserted.error)throw inserted.error;const loaded=await db.from(billingTable()).select('*').eq('workspace_id',business.id).single();if(loaded.error)throw loaded.error;row=loaded.data;}
  if(action==='checkout'&&(business.archived_at||business.plan==='custom'||business.billing_admin_hold))throw new Error('Contact Mako');
  if(!row.stripe_customer_id){if(action==='portal')throw new Error('No billing customer');const customer=await stripeRequest<{id:string}>('customers',{'metadata[workspace_id]':business.id},`mako-customer-${business.id}`);const saved=await db.from(billingTable()).update({stripe_customer_id:customer.id}).eq('workspace_id',business.id).is('stripe_customer_id',null);if(saved.error)throw saved.error;const loaded=await db.from(billingTable()).select('*').eq('workspace_id',business.id).single();if(loaded.error)throw loaded.error;row=loaded.data;}
  const returnUrl=`${billingOrigin()}/workspace?view=plan`;
  if(action==='portal'){const session=await stripeRequest<{url:string}>('billing_portal/sessions',{customer:row.stripe_customer_id,configuration:process.env.STRIPE_PORTAL_CONFIGURATION_ID!,return_url:returnUrl});destination=session.url;}
  else{
   const existing=await subscriptions(row.stripe_customer_id);if(existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))throw new Error('Subscription exists');
   if(Date.now()-new Date(row.checkout_started_at).getTime()>=86400000){const next={checkout_attempt:randomUUID(),checkout_started_at:new Date().toISOString()};const refreshed=await db.from(billingTable()).update(next).eq('workspace_id',business.id).eq('checkout_attempt',row.checkout_attempt).select('*').maybeSingle();if(refreshed.error||!refreshed.data)throw new Error('Retry checkout');row=refreshed.data;}
   const price=await stripeRequest<{active:boolean;type:string;unit_amount:number;currency:string;recurring:{interval:string;interval_count:number}}>(`prices/${encodeURIComponent(process.env.STRIPE_PRO_PRICE_ID!)}`);if(!price.active||price.type!=='recurring'||price.unit_amount!==10000||price.currency!=='usd'||price.recurring.interval!=='month'||price.recurring.interval_count!==1)throw new Error('Invalid recurring price');
   const parameters={integration_identifier:'mako_pro_qmpvaztr','subscription_data[billing_mode][type]':'flexible',mode:'subscription',customer:row.stripe_customer_id,client_reference_id:business.id,'line_items[0][price]':process.env.STRIPE_PRO_PRICE_ID!,'line_items[0][quantity]':'1',payment_method_collection:'always','subscription_data[metadata][workspace_id]':business.id,success_url:returnUrl+'&message=Your+payment+is+being+verified.+Pro+access+activates+automatically+after+confirmation.',cancel_url:returnUrl};
   let session=await stripeRequest<{url:string|null;status:string}>('checkout/sessions',parameters,`mako-monthly-v2-${row.checkout_attempt}`);
   if(session.status==='expired'||session.status==='complete'){const attempt=randomUUID(),started=new Date().toISOString();const updated=await db.from(billingTable()).update({checkout_attempt:attempt,checkout_started_at:started}).eq('workspace_id',business.id).eq('checkout_attempt',row.checkout_attempt).select('checkout_attempt').maybeSingle();if(updated.error||!updated.data)throw new Error('Retry checkout');session=await stripeRequest('checkout/sessions',parameters,`mako-monthly-v2-${attempt}`);}
   if(!session.url||session.status!=='open')throw new Error('Refresh subscription');destination=session.url;
  }
 }catch{redirect('/workspace?view=plan&message=Billing+could+not+be+opened.+Please+contact+Mako+or+try+again.');}
 const url=new URL(destination);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))redirect('/workspace?view=plan&message=Invalid+billing+destination.');redirect(destination);
}
