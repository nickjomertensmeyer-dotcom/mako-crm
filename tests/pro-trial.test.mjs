import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proCheckoutParameters,eligibleForProTrial,PRO_TRIAL_OFFER,trialReminderDue} from '../lib/pro-trial.ts';
import {proEntitlement} from '../lib/billing-security.ts';
const now=1800000000;
const trial={id:'sub_trial',status:'trialing',livemode:false,cancel_at_period_end:false,trial_start:now,trial_end:now+7*86400,default_payment_method:'pm_test',metadata:{mako_trial:PRO_TRIAL_OFFER},latest_invoice:{status:'paid',amount_paid:0},items:{data:[{price:{id:'pro'}}]}};
test('trial checkout requires payment details and schedules exactly seven free days',()=>{
 const p=proCheckoutParameters('cus_test','workspace','pro','https://example.com/workspace?view=plan',true);
 assert.equal(p.payment_method_collection,'always');assert.equal(p['subscription_data[trial_period_days]'],'7');assert.equal(p['subscription_data[trial_settings][end_behavior][missing_payment_method]'],'cancel');assert.equal(p['subscription_data[metadata][mako_trial]'],PRO_TRIAL_OFFER);assert.match(p['custom_text[submit][message]'],/100 USD\/month/);assert.match(p['custom_text[submit][message]'],/cancel before/);
 const returning=proCheckoutParameters('cus_test','workspace','pro','https://example.com/workspace?view=plan',false);assert.equal(returning['subscription_data[trial_period_days]'],undefined);assert.equal(returning['subscription_data[metadata][mako_trial]'],undefined);
});
test('prior canceled or paid subscriptions cannot restart the introductory trial',()=>{
 assert.equal(eligibleForProTrial(0,null),true);assert.equal(eligibleForProTrial(1,null),false);assert.equal(eligibleForProTrial(0,'sub_old'),false);assert.equal(eligibleForProTrial(0,null,true),false);
});
test('confirmed card-backed trial grants Pro until the exact trial deadline',()=>{
 assert.equal(proEntitlement([trial],'pro',false,undefined,now).active,true);
 assert.equal(proEntitlement([{...trial,cancel_at_period_end:true}],'pro',false,undefined,trial.trial_end-1).active,true);
 assert.equal(proEntitlement([trial],'pro',false,undefined,trial.trial_end).active,false);
 for(const changed of [{default_payment_method:null},{metadata:{}},{trial_end:now+8*86400},{trial_start:now+1},{pause_collection:{}},{status:'canceled'},{status:'past_due'},{livemode:true},{trial_end:undefined}])assert.equal(proEntitlement([{...trial,...changed}],'pro',false,undefined,now).active,false);
 assert.equal(proEntitlement([trial],'other',false,undefined,now).active,false);
});
test('first failed post-trial charge receives no renewal grace; paid conversion retains Pro',()=>{
 const failed={...trial,status:'past_due',latest_invoice:{status:'open',billing_reason:'subscription_cycle',lines:{data:[{amount:10000,period:{start:trial.trial_end,end:trial.trial_end+30*86400},pricing:{price_details:{price:'pro'}}}]}}};
 assert.equal(proEntitlement([failed],'pro',false,undefined,trial.trial_end+1).active,false);
 assert.equal(proEntitlement([{...failed,status:'active',latest_invoice:{...failed.latest_invoice,status:'paid',amount_paid:10000}}],'pro',false,undefined,trial.trial_end+1).active,true);
});

test('trial reminders are due within three days and exclude canceled or converted trials',()=>{
 assert.equal(trialReminderDue(trial,now),false);assert.equal(trialReminderDue(trial,trial.trial_end-3*86400),true);assert.equal(trialReminderDue(trial,trial.trial_end),false);assert.equal(trialReminderDue({...trial,cancel_at_period_end:true},trial.trial_end-86400),false);assert.equal(trialReminderDue({...trial,status:'active'},trial.trial_end-86400),false);assert.equal(trialReminderDue({...trial,metadata:{}},trial.trial_end-86400),false);
});
