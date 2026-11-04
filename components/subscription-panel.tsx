import {proPriceIds} from '@/lib/pro-pricing';
import {eligibleForProTrial} from '@/lib/pro-trial';
import {billingSnapshot} from '@/lib/billing-sync';
import {billingDate} from '@/lib/billing-policy';
import {CreditCard,ExternalLink} from 'lucide-react';
import {openBilling} from '@/app/workspace/billing/actions';
import {workspace} from '@/lib/workspace';
import {billingTable,billingReady,stripeClient} from '@/lib/billing';
import {subscriptionCapacity,monthlyTotal,planById,type PlanId} from '@/lib/plans';
import type {EntitlementSubscription} from '@/lib/billing-security';
import {BillingPlanPicker} from './billing-plan-picker';
import {cookies} from 'next/headers';
import {PLAN_COOKIE} from '@/lib/plan-selection';
export async function SubscriptionPanel({demo=false}:{demo?:boolean}){
 let owner=false,ready=false,customer=false,custom=false,blocked=false,error='',sub:EntitlementSubscription|undefined,price='',graceEnd=0,paidThrough=0,trialEligible=true,tier:PlanId='pro',users=5;
 const selected=planById((await cookies()).get(PLAN_COOKIE)?.value);if(selected){tier=selected.id;users=selected.includedUsers;}
 if(!demo){
  const {business,role,client}=await workspace();owner=role==='owner';custom=business.plan==='custom';blocked=Boolean(business.archived_at||business.billing_admin_hold);ready=billingReady();
  if(owner&&ready)try{
   const {data,error:e}=await client.from(billingTable()).select('stripe_customer_id,subscription_id').eq('workspace_id',business.id).maybeSingle();if(e)throw e;customer=Boolean(data?.stripe_customer_id);
   if(customer){
    const result=await billingSnapshot(data!.stripe_customer_id);trialEligible=eligibleForProTrial(result.subscriptions.length,data?.subscription_id);
    sub=result.subscriptions.find(s=>s.id===result.access.subscription);graceEnd=result.access.graceEnd;paidThrough=result.access.paidThrough;
    const cap=subscriptionCapacity(sub);if(cap){tier=cap.tier;users=cap.users;price=`$${monthlyTotal(tier,users)/100} USD / month · ${users} user seats`;}
    else if(sub){const id=sub.items.data.find(i=>proPriceIds().includes(i.price.id))?.price.id;if(id){const p=await stripeClient().prices.retrieve(id);if(p.unit_amount!==null)price=`$${p.unit_amount/100} USD / month · existing agreed price`;}}
   }
  }catch{error='Unable to load billing. Refresh or contact Mako.';}
 }
 const end=(sub?.status==='trialing'?sub.trial_end:0)||paidThrough||Math.max(0,...(sub?.items.data.filter(i=>proPriceIds().includes(i.price.id)).map(i=>i.current_period_end||0)||[]));
 const existing=Boolean(sub&&!['canceled','incomplete_expired'].includes(sub.status));
 const locked=demo||!owner||!ready||Boolean(error)||custom||blocked;
 const canChange=existing&&['active','trialing'].includes(sub!.status)&&!sub!.cancel_at_period_end;
 return <section className="panel subscription-panel"><div className="panel-title"><h2><CreditCard size={20}/> Your subscription</h2><span className="badge">{demo?'Demo':sub?sub.status.replaceAll('_',' '):'Choose a plan'}</span></div>
 {demo?<p>This is a demo. Checkout, user changes, and cancellation are disabled.</p>:<>
  <p>{custom?'Custom pricing follows your agreement with Mako.':price?`Mako ${planById(tier)!.name} · ${price}, plus applicable tax.`:'Starter $49 · Pro $100 · Team $179 per month, plus applicable tax.'}</p>
  {!custom&&!existing&&trialEligible&&<p className="notice"><strong>Seven days free for your first subscription.</strong> Payment details required. Stripe shows your selected plan and total. It charges that monthly total after seven days unless you cancel before the trial ends. No onboarding fee.</p>}
  {sub?.status==='trialing'&&<p className="notice" role="status"><strong>Your trial is active.</strong> {sub.trial_end&&`It ends ${billingDate(sub.trial_end)}.`} Unless canceled before then, your payment method will be charged {price||'the monthly total shown in Stripe'}, plus applicable tax.</p>}
  {!existing&&!trialEligible&&<p className="notice">Your introductory trial has already been used. A returning subscription is charged at checkout.</p>}
  {sub?.cancel_at_period_end&&<p className="notice">Cancellation scheduled. {end?`Access ends ${billingDate(end)}.`:'Stripe shows your exact access-end date.'} Your records are preserved.</p>}
  {graceEnd>0&&<p className="notice" role="status">{graceEnd>Date.now()/1000?`Your renewal needs payment. Update your payment method before ${billingDate(graceEnd)} to keep access.`:`Your seven-day renewal grace period ended ${billingDate(graceEnd)}. Complete payment to restore access.`}</p>}
  {!ready&&<p className="notice">Billing is temporarily unavailable. Contact Mako for help.</p>}{!owner&&<p>Only the workspace owner can manage billing and paid user seats.</p>}{error&&<p className="notice" role="alert">{error}</p>}
 </>}
 {existing?<><button className="primary compact subscription-activate" disabled>{sub?.status==='trialing'?'Trial active':'Plan active'}</button><details className="workspace-details"><summary>Manage plan and user seats</summary><BillingPlanPicker existing disabled={locked||!canChange} initialTier={tier} initialUsers={users}/>{!canChange&&<p>Resolve any payment or scheduled cancellation in the billing portal before changing your plan.</p>}</details></>:<BillingPlanPicker disabled={locked} initialTier={tier} initialUsers={users}/>}
 <details className="billing-cancel-details"><summary className="secondary subscription-manage">Manage / cancel subscription</summary><div className="notice"><strong>Before you cancel</strong><p>{end?`Access continues until ${billingDate(end)} if you cancel at the end of this period.`:'Cancel before your trial ends to avoid its first charge. Paid subscriptions keep access until the paid period ends.'} Stripe displays the exact date before you confirm. Your records are preserved.</p><p>The seven-day grace period applies only to failed renewals. It does not extend a trial or add days after cancellation. A refund preserves access through the paid period.</p><form action={demo?undefined:openBilling}><input type="hidden" name="intent" value="portal"/><button className="secondary" disabled={demo||!owner||!ready||!customer||Boolean(error)}>Continue to billing portal <ExternalLink size={15}/></button></form></div></details>
 <p className="small-copy muted">Renews monthly until canceled. Adding users requires a billing confirmation; sending an invitation does not add a charge. Remove members before reducing seats. Removing a member alone does not reduce your bill.</p><p className="small-copy"><a href="/terms#refunds">First-payment refund available on request within seven days.</a> Cancel separately to stop renewals. <a href="/privacy#retention">Data retention</a>.</p></section>;
}
