export const PRO_TRIAL_DAYS = 7;
export const PRO_TRIAL_OFFER = 'pro_7_day_v1';

// Any previous subscription consumes the introductory offer, even if canceled.
export function eligibleForProTrial(subscriptionCount:number, linkedSubscription:string|null|undefined, hasMore=false){
 return subscriptionCount===0&&!linkedSubscription&&!hasMore;
}
export function proCheckoutParameters(customer:string,workspaceId:string,price:string,returnUrl:string,trial:boolean):Record<string,string>{
 return {
  integration_identifier:'mako_pro_qmpvaztr',mode:'subscription',customer,client_reference_id:workspaceId,
  'subscription_data[billing_mode][type]':'flexible','line_items[0][price]':price,'line_items[0][quantity]':'1',
  payment_method_collection:'always','subscription_data[metadata][workspace_id]':workspaceId,
  ...(trial?{'subscription_data[trial_period_days]':String(PRO_TRIAL_DAYS),'subscription_data[trial_settings][end_behavior][missing_payment_method]':'cancel','subscription_data[metadata][mako_trial]':PRO_TRIAL_OFFER}:{}),
  'custom_text[submit][message]':trial?'7 days free. Then $50 USD/month plus applicable tax, charged automatically unless you cancel before the trial ends. Cancel in Plan & data → Manage / cancel subscription.':'$50 USD/month plus applicable tax. Renews automatically until canceled.',
  success_url:returnUrl+'&message='+encodeURIComponent(trial?'Your trial activation is being verified. Pro access activates automatically after Stripe confirms your payment details.':'Your payment is being verified. Pro access activates automatically after confirmation.'),
  cancel_url:returnUrl,
 };
}

export function trialReminderDue(subscription:{status:string;cancel_at_period_end:boolean;trial_end?:number;metadata?:Record<string,string>},now=Math.floor(Date.now()/1000)){
 return subscription.status==='trialing'&&!subscription.cancel_at_period_end&&subscription.metadata?.mako_trial===PRO_TRIAL_OFFER&&Boolean(subscription.trial_end)&&subscription.trial_end!>now&&subscription.trial_end!-now<=3*86400;
}
