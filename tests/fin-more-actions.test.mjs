import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFinResult} from '../lib/fin.ts';
const ctx={contacts:[],services:[{id:'s1',name:'Mowing',unit_cents:5000}],
 work:[{id:'w1',title:'Oak trimming',kind:'Job',status:'Planned',scheduled_date:'2026-11-10',scheduled_time:'09:00:00',archived_at:null},{id:'w2',title:'Old visit',kind:'Appointment',status:'Planned',scheduled_date:'2026-10-01',scheduled_time:'10:00:00',archived_at:'2026-10-02T00:00:00Z'}]};
const act=(kind,data,title='x')=>({answer:'ok',action:{kind,title,contact_id:null,date:null,time:null,notes:'',lines:[],data_json:JSON.stringify(data)}});
test('reschedule carries previous schedule for conflict detection',()=>{
 const r=validateFinResult(act('reschedule_work',{record_id:'w1',date:'2026-11-12',time:'13:30'}),ctx);
 assert.equal(r.cost,1);assert.equal(r.action.data.previous_date,'2026-11-10');assert.equal(r.action.data.previous_time,'09:00');
 assert.ok(r.action.display.some(d=>d.label==='To'&&d.value==='2026-11-12 13:30'));
});
test('reschedule rejects bad dates, times, unknown or trashed items',()=>{
 for(const data of [{record_id:'w1',date:'2026-02-31',time:'09:00'},{record_id:'w1',date:'2026-11-12',time:'25:00'},{record_id:'nope',date:'2026-11-12',time:'09:00'},{record_id:'w2',date:'2026-11-12',time:'09:00'},{record_id:'w1',date:'2026-11-12',time:'09:00',extra:1}])
  assert.throws(()=>validateFinResult(act('reschedule_work',data),ctx));
});
test('trash and restore check the item is in the right state',()=>{
 assert.equal(validateFinResult(act('trash_work',{record_id:'w1'}),ctx).cost,1);
 assert.throws(()=>validateFinResult(act('trash_work',{record_id:'w2'}),ctx));
 assert.equal(validateFinResult(act('restore_work',{record_id:'w2'}),ctx).cost,1);
 assert.throws(()=>validateFinResult(act('restore_work',{record_id:'w1'}),ctx));
});
test('service edits validate price and require a saved service',()=>{
 const r=validateFinResult(act('update_service',{record_id:'s1',unit_cents:6500}),ctx);
 assert.ok(r.action.display.some(d=>d.value==='$50.00 → $65.00'));
 assert.equal(r.action.data.previous_unit_cents,5000);
 for(const data of [{record_id:'s1'},{record_id:'s1',unit_cents:-5},{record_id:'s1',unit_cents:1.5},{record_id:'zz',unit_cents:100},{record_id:'s1',name:'  '}])
  assert.throws(()=>validateFinResult(act('update_service',data),ctx));
 assert.equal(validateFinResult(act('archive_service',{record_id:'s1'}),ctx).cost,1);
});
