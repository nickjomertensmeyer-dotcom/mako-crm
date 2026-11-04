'use server';
import type Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {redirect} from 'next/navigation';
import {workspace} from '@/lib/workspace';
import {billingSnapshot} from '@/lib/billing-sync';
import {billingTable,billingClient,billingOrigin,billingReady,stripeRequest,stripeClient,subscriptions} from '@/lib/billing';
import {eligibleForProTrial,proCheckoutParameters} from '@/lib/pro-trial';
import {planById,planPriceId,userQuantity,monthlyTotal,validPlanPrice} from '@/lib/plans';

export async function openBilling(form:FormData){
 const {business,role,user}=await workspace();const action=String(form.get('intent'));let destination='',problem='';
 if(role!=='owner'||!['checkout','portal','change'].includes(action))redirect('/workspace?view=plan&message=Only+the+workspace+owner+can+manage+billing.');
 try{
  if(!billingReady())throw Error('Billing is temporarily unavailable. Please contact Mako.');
  const db=billingClient(),table=billingTable(),stripe=stripeClient(),live=process.env.STRIPE_LIVE_MODE==='true';
  const loaded=await db.from(table).select('*').eq('workspace_id',business.id).maybeSingle();if(loaded.error)throw Error('Could not load billing.');let row=loaded.data;
  if(!row){const inserted=await db.from(table).upsert({workspace_id:business.id},{onConflict:'workspace_id',ignoreDuplicates:true});if(inserted.error)throw Error('Could not prepare billing.');const r=await db.from(table).select('*').eq('workspace_id',business.id).single();if(r.error)throw Error('Could not prepare billing.');row=r.data;}
  if(action!=='portal'&&(business.archived_at||business.plan==='custom'||business.billing_admin_hold))throw Error('Contact Mako to manage this workspace’s agreement.');
  if(!row.stripe_customer_id){
   if(action!=='checkout')throw Error('There is no linked subscription yet.');
   const customer=await stripe.customers.create({email:user.email,name:business.name,metadata:{workspace_id:business.id}},{idempotencyKey:`mako-customer-${business.id}`});
   const save=await db.from(table).update({stripe_customer_id:customer.id}).eq('workspace_id',business.id).is('stripe_customer_id',null);if(save.error)throw Error('Could not save the billing account.');
   const refreshed=await db.from(table).select('*').eq('workspace_id',business.id).single();if(refreshed.error)throw Error('Could not load billing.');row=refreshed.data;
  }
  const returnUrl=`${billingOrigin()}/workspace?view=plan`;
  if(action==='portal'){
   const session=await stripe.billingPortal.sessions.create({customer:row.stripe_customer_id,configuration:process.env.STRIPE_PORTAL_CONFIGURATION_ID,return_url:returnUrl});destination=session.url;
  }else{
   const plan=planById(form.get('tier')||'pro');if(!plan)throw Error('Choose Starter, Pro, or Team.');
   const users=userQuantity(form.get('users')||plan.includedUsers,plan.includedUsers),priceId=planPriceId(plan.id)!;
   const price=await stripe.prices.retrieve(priceId,{expand:['tiers']});
   if(!validPlanPrice(price,plan.id,live))throw Error('This plan price is unavailable. Please contact Mako.');
   // Capacity changes are reviewed here and confirmed by the owner on Stripe, never by an invitation.
   const roster=await db.from('memberships').select('user_id',{count:'exact',head:true}).eq('workspace_id',business.id);
   const invitations=await db.from('team_invitations').select('id',{count:'exact',head:true}).eq('workspace_id',business.id).is('accepted_at',null).is('revoked_at',null).gt('expires_at',new Date().toISOString());
   if(roster.error||invitations.error)throw Error('Could not check user seats.');
   if((roster.count||0)+(invitations.count||0)>users)throw Error('Remove members or revoke pending invitations before reducing user seats.');
   if(action==='change'){
    const snapshot=await billingSnapshot(row.stripe_customer_id),sub=snapshot.subscriptions.find(s=>s.id===snapshot.access.subscription);
    if(!sub||!['active','trialing'].includes(sub.status)||sub.cancel_at_period_end||sub.items.data.length!==1)throw Error('Restore an active subscription before changing its plan or users.');
    if(sub.pending_update||sub.schedule)throw Error('A billing change is already pending. Resolve it in the billing portal first.');
    const session=await stripe.billingPortal.sessions.create({customer:row.stripe_customer_id,configuration:process.env.STRIPE_TIERS_PORTAL_CONFIGURATION_ID,return_url:returnUrl,flow_data:{type:'subscription_update_confirm',subscription_update_confirm:{subscription:sub.id,items:[{id:sub.items.data[0].id!,price:priceId,quantity:users}]},after_completion:{type:'redirect',redirect:{return_url:returnUrl+'&message=Your+billing+change+is+being+verified.'}}}});destination=session.url;
   }else{
    const claim=await db.rpc('claim_checkout_session',{target:business.id,is_live:live});if(claim.error||!claim.data)throw Error('Checkout is already being prepared. Please try again.');row=claim.data;
    try{
     const existing=await subscriptions(row.stripe_customer_id);if(existing.has_more||existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))throw Error('You already have a subscription. Use Manage plan and users below.');
     if(row.checkout_session_id){
      const old=await stripe.checkout.sessions.retrieve(row.checkout_session_id);
      if(old.status==='open'&&row.checkout_tier===plan.id&&row.checkout_users===users){destination=old.url||'';}
      else {if(old.status==='open')await stripe.checkout.sessions.expire(old.id);const next={checkout_attempt:randomUUID(),checkout_session_id:null,checkout_started_at:new Date().toISOString()};const saved=await db.from(table).update(next).eq('workspace_id',business.id).eq('checkout_lock',row.checkout_lock);if(saved.error)throw Error('Could not close the previous checkout.');Object.assign(row,next);}
     }
     if(!destination){
      const customer=await stripe.customers.retrieve(row.stripe_customer_id);if(!customer.deleted&&!customer.email&&user.email)await stripe.customers.update(customer.id,{email:user.email});
      const trial=eligibleForProTrial(existing.data.length,row.subscription_id,existing.has_more);
      const parameters=proCheckoutParameters(row.stripe_customer_id,business.id,priceId,returnUrl,trial,{name:plan.name,monthlyCents:monthlyTotal(plan.id,users),users});
      const open=await stripe.checkout.sessions.list({customer:row.stripe_customer_id,status:'open',limit:100});if(open.has_more)throw Error('Please contact Mako to resolve older checkouts.');
      for(const old of open.data)if(old.mode==='subscription'&&old.client_reference_id===business.id)await stripe.checkout.sessions.expire(old.id);
      const session=await stripeRequest<Stripe.Checkout.Session>('checkout/sessions',parameters,`mako-detailing-v1-${row.checkout_attempt}-${plan.id}-${users}-${priceId}`);
      if(session.status!=='open'||!session.url)throw Error('Please refresh checkout.');
      const saved=await db.from(table).update({checkout_session_id:session.id,checkout_tier:plan.id,checkout_users:users}).eq('workspace_id',business.id).eq('checkout_lock',row.checkout_lock);if(saved.error)throw Error('Could not save checkout. Please try again.');destination=session.url;
     }
    }finally{await db.from(table).update({checkout_lock:null,checkout_lock_until:null}).eq('workspace_id',business.id).eq('checkout_lock',row.checkout_lock);}
   }
  }
 }catch(error){problem=error instanceof Error&&!('type' in error)?error.message:'Billing could not be opened. Please try again or contact Mako.';}
 if(problem)redirect('/workspace?view=plan&message='+encodeURIComponent(problem));
 const url=new URL(destination);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))redirect('/workspace?view=plan&message=Invalid+billing+destination.');redirect(destination);
}
