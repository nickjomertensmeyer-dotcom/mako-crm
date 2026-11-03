import 'server-only';
import {billingClient,billingOrigin,stripeRequest} from './billing';
import {trialReminderDue} from './pro-trial';
import {billingDate} from './billing-policy';
import type {EntitlementSubscription} from './billing-security';
export async function remindProTrial(customer:string,workspaceId:string,subscriptions:EntitlementSubscription[]){
 const due=subscriptions.filter(s=>s.livemode===(process.env.STRIPE_LIVE_MODE==='true')&&s.items.data.some(i=>i.price.id===process.env.STRIPE_PRO_PRICE_ID)&&trialReminderDue(s));
 if(!due.length)return;
 const key=process.env.RESEND_API_KEY,from=process.env.FOLLOWUP_FROM_EMAIL;if(!key||!from)throw new Error('Trial reminder email is not configured');
 const db=billingClient();
 for(const sub of due){
  const eventId=`pro-trial-reminder-${sub.id}-${sub.trial_end}`;
  const previous=await db.from('billing_events').select('event_id').eq('event_id',eventId).maybeSingle();if(previous.error)throw previous.error;if(previous.data)continue;
  const details=await stripeRequest<{email?:string|null;deleted?:boolean}>(`customers/${encodeURIComponent(customer)}`);if(details.deleted||!details.email)throw new Error('Trial customer email unavailable');
  const text=`Your Mako Pro free trial ends on ${billingDate(sub.trial_end!)}.\n\nUnless you cancel before then, your saved payment method will be charged $100 USD/month plus applicable tax. Pro renews monthly until canceled.\n\nManage or cancel before the trial ends: ${billingOrigin()}/workspace?view=plan\nChoose Manage / cancel subscription, then Continue to billing portal.\n\nQuestions? Contact makocrm@gmail.com.\nMako CRM`;
  const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':eventId},body:JSON.stringify({from,to:[details.email],subject:'Your Mako Pro free trial ends soon',text}),signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw new Error('Trial reminder delivery failed');
  const saved=await db.from('billing_events').insert({event_id:eventId,workspace_id:workspaceId});if(saved.error&&saved.error.code!=='23505')throw saved.error;
 }
}
