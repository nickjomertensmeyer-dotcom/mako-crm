import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plans,monthlyTotal,validPlanPrice,subscriptionCapacity,userQuantity} from '../lib/plans.ts';
import {proEntitlement} from '../lib/billing-security.ts';
test('every supported user count charges the flat plan plus only additional users',()=>{
 for(const p of plans){assert.equal(monthlyTotal(p.id,p.includedUsers),p.monthlyCents);for(let n=p.includedUsers;n<=100;n++)assert.equal(monthlyTotal(p.id,n),p.monthlyCents+(n-p.includedUsers)*1500);assert.equal(monthlyTotal(p.id,p.includedUsers+1),p.monthlyCents+1500);}
 for(const n of [-1,0,1.5,101,NaN,Infinity,'1e2','2.0','',null])assert.throws(()=>userQuantity(n));
 assert.throws(()=>monthlyTotal('pro',4));
});
test('checkout rejects an incorrect currency, amount, interval, included tier or environment',()=>{
 for(const p of plans){const price={active:true,livemode:false,type:'recurring',currency:'usd',billing_scheme:'tiered',tiers_mode:'graduated',recurring:{interval:'month',interval_count:1},tiers:[{up_to:p.includedUsers,flat_amount:p.monthlyCents,unit_amount:0},{up_to:null,flat_amount:0,unit_amount:1500}]};assert.equal(validPlanPrice(price,p.id,false),true);for(const changed of [{currency:'eur'},{livemode:true},{active:false},{billing_scheme:'per_unit'},{tiers_mode:'volume'},{recurring:{interval:'year',interval_count:1}},{tiers:[{...price.tiers[0],flat_amount:1},price.tiers[1]]},{tiers:[price.tiers[0],{...price.tiers[1],unit_amount:1501}]}])assert.equal(validPlanPrice({...price,...changed},p.id,false),false);}
});
test('seats are derived from a known single Stripe price and valid licensed quantity',()=>{
 const env={STRIPE_STARTER_PRICE_ID:'start',STRIPE_PRO_PRICE_ID:'pro',STRIPE_TEAM_PRICE_ID:'team'};
 assert.deepEqual(subscriptionCapacity({items:{data:[{price:{id:'pro'},quantity:7}]}},env),{tier:'pro',users:7,priceId:'pro'});
 for(const data of [[{price:{id:'pro'},quantity:4}],[{price:{id:'unknown'},quantity:50}],[{price:{id:'team'},quantity:1}],[{price:{id:'pro'},quantity:5},{price:{id:'start'},quantity:1}],[{price:{id:'pro'},quantity:5.5}]])assert.equal(subscriptionCapacity({items:{data}},env),null);
});
test('a pending paid-period upgrade preserves existing access but never grants an unpaid first purchase',()=>{
 const now=1800000000,sub={id:'sub',status:'active',livemode:false,cancel_at_period_end:false,pending_update:{},previousPaidThrough:now+1000,latest_invoice:{status:'open',billing_reason:'subscription_update'},items:{data:[{price:{id:'pro'}}]}};
 assert.equal(proEntitlement([sub],'pro',false,undefined,now).active,true);
 assert.equal(proEntitlement([{...sub,previousPaidThrough:0}],'pro',false,undefined,now).active,false);
 assert.equal(proEntitlement([{...sub,previousPaidThrough:now}],'pro',false,undefined,now).active,false);
});
