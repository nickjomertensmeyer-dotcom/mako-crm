import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trialStage,trialMetrics} from '../lib/owner-trials.ts';
const now=1800000000;
const base={id:'sub',workspaceId:'w',business:'Business',status:'trialing',startsAt:now-86400,endsAt:now+3*86400,cancelAtEnd:false,converted:false};
test('owner trial stages distinguish impending billing, cancellations, payment failures and conversions',()=>{
 assert.equal(trialStage(base,now),'Trial active');assert.equal(trialStage({...base,endsAt:now+3600},now),'Ending soon');assert.equal(trialStage({...base,cancelAtEnd:true},now),'Canceling trial');assert.equal(trialStage({...base,status:'past_due'},now),'Payment needed');assert.equal(trialStage({...base,status:'canceled'},now),'Trial ended');assert.equal(trialStage({...base,status:'active',converted:true},now),'Converted to paid');
});
test('conversion excludes ongoing trials and preserves historical paid conversions',()=>{
 const rows=[base,{...base,endsAt:now+3600},{...base,status:'canceled'},{...base,status:'active',converted:true},{...base,status:'canceled',converted:true}];
 assert.deepEqual(trialMetrics(rows,now),{total:5,active:2,ending:1,converted:2,completed:3,conversion:67});assert.equal(trialMetrics([],now).conversion,null);
});
