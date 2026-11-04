import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detailingFollowups} from '../lib/detailing-followups.ts';
const fixture=()=>({contacts:[{id:'c',name:'Alex',stage:'Customer'}],tasks:[],documents:[],work:[]});
test('quote follow-ups wait three days and exclude answered quotes and booked work',()=>{
 const d=fixture();d.documents=[{id:'q',kind:'Quote',customer_id:'c',status:'Issued',issued_date:'2026-10-31',number:'Q1'}];
 assert.equal(detailingFollowups(d,'2026-11-02').length,0);assert.equal(detailingFollowups(d,'2026-11-03')[0].kind,'quote');
 d.work=[{id:'j',customer_id:'c',status:'Planned',kind:'Job'}];assert.equal(detailingFollowups(d,'2026-11-03').length,0);
 d.work=[];d.documents[0].status='Accepted';assert.equal(detailingFollowups(d,'2026-11-03').length,0);
});
test('repeat bookings use the latest completed job and respect existing follow-ups',()=>{
 const d=fixture();d.work=[{id:'j',customer_id:'c',status:'Completed',kind:'Job',scheduled_date:'2026-10-01'}];
 assert.equal(detailingFollowups(d,'2026-11-03',30)[0].kind,'rebook');assert.equal(detailingFollowups(d,'2026-11-03',60).length,0);
 d.tasks=[{id:'t',contact_id:'c',status:'To do'}];assert.equal(detailingFollowups(d,'2026-11-03').length,0);
 d.tasks[0].status='Done';assert.equal(detailingFollowups(d,'2026-11-03').length,1);
 d.contacts[0].followup_date='2026-11-04';assert.equal(detailingFollowups(d,'2026-11-03').length,0);
 delete d.contacts[0].followup_date;d.work.push({...d.work[0],id:'new',scheduled_date:'2026-11-02'});assert.equal(detailingFollowups(d,'2026-11-03').length,0);
});
