import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attentionItems} from '../lib/workspace-attention.ts';

const today='2026-11-02';
const empty=()=>({contacts:[],activity:[],documents:[],work:[]});
const lead={id:'lead',stage:'Lead',pipeline_stage:'New',created_at:'2026-10-26T12:00:00Z'};
const invoice={id:'invoice',kind:'Invoice',status:'Issued',due_date:'2026-11-01',total_cents:10000,paid_cents:0};

test('empty workspaces and ordinary future appointments keep navigation quiet',()=>{
 const data={...empty(),work:[{id:'visit',status:'Planned',scheduled_date:'2026-11-03'}]};
 assert.equal(attentionItems(data,today,['leads','invoices','schedule']).hasAttention,false);
});
test('quiet leads respect seven days, recent activity, archives, won status and enabled tools',()=>{
 const data={...empty(),contacts:[lead]};
 assert.equal(attentionItems(data,today,['leads']).hasAttention,true);
 for(const patch of [{archived_at:'2026-11-01'},{pipeline_stage:'Won'},{created_at:'2026-10-27T12:00:00Z'},{stage:'Customer'}]){
  assert.equal(attentionItems({...data,contacts:[{...lead,...patch}]},today,['leads']).hasAttention,false);
 }
 assert.equal(attentionItems({...data,activity:[{record_id:'lead',created_at:'2026-11-01T12:00:00Z'}]},today,['leads']).hasAttention,false);
 assert.equal(attentionItems(data,today,['invoices']).hasAttention,false);
});
test('only overdue, issued invoices with an outstanding balance trigger attention',()=>{
 const data={...empty(),documents:[invoice]};
 assert.equal(attentionItems(data,today,['invoices']).hasAttention,true);
 for(const patch of [{status:'Draft'},{status:'Void'},{status:'Paid'},{paid_cents:10000},{due_date:today},{due_date:'2026-11-03'}]){
  assert.equal(attentionItems({...data,documents:[{...invoice,...patch}]},today,['invoices']).hasAttention,false);
 }
 assert.equal(attentionItems(data,today,['leads']).hasAttention,false);
});
