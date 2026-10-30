import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proEntitlement} from '../lib/billing-security.ts';
import {RENEWAL_GRACE_SECONDS as week,renewalGraceEnd} from '../lib/billing-policy.ts';
const start=1800000000;
const line={amount:10000,period:{start,end:start+30*86400},pricing:{price_details:{price:'pro'}}};
const invoice={status:'open',billing_reason:'subscription_cycle',created:start,lines:{data:[line]}};
const sub={id:'sub_test',status:'past_due',livemode:false,cancel_at_period_end:false,latest_invoice:invoice,previousPaidThrough:start,items:{data:[{price:{id:'pro'},current_period_end:line.period.end}]}};
test('renewal grace ends at seven days exactly and retries do not extend it',()=>{
 assert.equal(proEntitlement([sub],'pro',false,undefined,start+week-1).active,true);
 assert.equal(proEntitlement([sub],'pro',false,undefined,start+week).active,false);
 assert.equal(renewalGraceEnd({...invoice,created:start+3*86400},start,'pro'),start+week);
});
test('first failed payment, wrong environment, unrelated price and old payments cannot grant grace',()=>{
 for(const changed of [{previousPaidThrough:0},{previousPaidThrough:start-1},{livemode:true},{latest_invoice:{...invoice,billing_reason:'subscription_create'}},{pause_collection:{}}])assert.equal(proEntitlement([{...sub,...changed}],'pro',false,undefined,start+1).active,false);
 assert.equal(proEntitlement([sub],'other',false,undefined,start+1).active,false);
});
test('paid recovery restores access, while scheduled cancellation keeps the paid period',()=>{
 const paid={...sub,status:'active',latest_invoice:{...invoice,status:'paid'}};
 assert.equal(proEntitlement([paid],'pro',false,undefined,start+week+1).active,true);
 assert.equal(proEntitlement([{...paid,cancel_at_period_end:true}],'pro',false,undefined,start+1).cancelAtEnd,true);
});
test('canceled paid subscriptions retain access only until the paid period ends, including after refund',()=>{
 const paid={...sub,status:'canceled',latest_invoice:{...invoice,status:'paid',amount_paid:10000}};
 assert.equal(proEntitlement([paid],'pro',false,undefined,line.period.end-1).active,true);
 assert.equal(proEntitlement([paid],'pro',false,undefined,line.period.end).active,false);
 assert.equal(proEntitlement([{...paid,pause_collection:{}}],'pro',false,undefined,start+1).active,false);
});
