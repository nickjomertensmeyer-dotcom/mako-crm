import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectAccountParameters,payableBalance,connectPaymentMatches} from '../lib/stripe-connect-model.ts';
test('connected businesses own payment fees and have their own dashboard',()=>{
 const params=connectAccountParameters('10000000-0000-4000-8000-000000000001','US');
 assert.equal(params.dashboard,'full');assert.equal(params.defaults.responsibilities.fees_collector,'stripe');assert.equal(params.defaults.responsibilities.losses_collector,'stripe');assert.equal(params.configuration.merchant.capabilities.card_payments.requested,true);
 assert.throws(()=>connectAccountParameters('untrusted'));
});
test('checkout balance rejects overpaid, fractional and unsafe amounts',()=>{
 assert.equal(payableBalance(2500,700),1800);
 for(const args of [[100,100],[100,101],[1.5,0],[-1,0],[100,-1],[Number.MAX_SAFE_INTEGER+1,0]])assert.throws(()=>payableBalance(...args));
});
test('payment confirmation must match account, environment, session, currency and balance',()=>{
 const expected={account:'acct_test',session:'cs_test',amount:1800,currency:'usd',live:false};
 const event={account:'acct_test',livemode:false};const session={id:'cs_test',mode:'payment',payment_status:'paid',amount_total:1800,currency:'usd'};
 assert.equal(connectPaymentMatches(expected,event,session),true);
 for(const patch of [{account:'acct_other'},{account:undefined},{livemode:true}])assert.equal(connectPaymentMatches(expected,{...event,...patch},session),false);
 for(const patch of [{id:'cs_other'},{mode:'subscription'},{payment_status:'unpaid'},{amount_total:1700},{currency:'eur'}])assert.equal(connectPaymentMatches(expected,event,{...session,...patch}),false);
});
