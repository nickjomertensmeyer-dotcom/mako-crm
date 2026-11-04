import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PRO_MONTHLY_CENTS,proPriceIds} from '../lib/pro-pricing.ts';
import {proEntitlement} from '../lib/billing-security.ts';
test('checkout price is one hundred dollars and prior price IDs remain explicitly trusted',()=>{
 assert.equal(PRO_MONTHLY_CENTS,10000);assert.deepEqual(proPriceIds('new',' old,old, ,new '),['new','old']);
 const paid={id:'sub_old',livemode:true,status:'active',cancel_at_period_end:false,latest_invoice:{status:'paid'},items:{data:[{price:{id:'old'}}]}};
 assert.equal(proEntitlement([paid],['new','old'],true).active,true);assert.equal(proEntitlement([paid],['new'],true).active,false);assert.equal(proEntitlement([{...paid,livemode:false}],['new','old'],true).active,false);
});
