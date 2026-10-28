import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyView,selectRows,selectedRecord,boardMetrics,readableDate} from '../lib/boards.ts';
test('board filtering, sorting, archive views, and report definitions agree',()=>{
 const tasks=[{id:'1',version:1,title:'Call Alex',status:'To do',due_date:'2026-10-27',completed:false,owner_id:'a'},{id:'2',version:1,title:'Done work',status:'Done',completed:true},{id:'3',version:1,title:'Archived',completed:false,archived_at:'2026-01-01'},{id:'4',version:1,title:'Draft proposal',status:'In progress',due_date:'2026-10-28',completed:false,owner_id:'b'}];
 const contacts=[{id:'c',version:1,stage:'Customer',name:'Customer',followup_date:'2026-10-28'},{id:'l',version:1,stage:'Lead',pipeline_stage:'Qualified',estimated_value:2000},{id:'w',version:1,stage:'Lead',pipeline_stage:'Won',estimated_value:1000}];
 const data={tasks,contacts,documents:[{kind:'Invoice',status:'Issued',total_cents:10000,paid_cents:2000},{kind:'Invoice',status:'Draft',total_cents:30000,paid_cents:0},{kind:'Quote',status:'Accepted',total_cents:90000,paid_cents:0},{kind:'Invoice',status:'Void',total_cents:50000,paid_cents:0}]};
 assert.deepEqual(selectRows(tasks,{...emptyView,filter:'overdue'},'tasks','2026-10-28').map(t=>t.id),['1']);
 assert.deepEqual(selectRows(tasks,{...emptyView,filter:'incomplete',owner:'b'},'tasks').map(t=>t.id),['4']);
 assert.equal(selectRows(tasks,{...emptyView,search:'alex'},'tasks').length,1);
 assert.equal(selectRows(tasks,{...emptyView,archived:true},'tasks')[0].id,'3');
 assert.deepEqual(selectRows(tasks,{...emptyView,sort:'title'},'tasks').map(t=>t.id),['1','2','4']);
 assert.deepEqual(boardMetrics(data,'2026-10-28'),{customers:1,leads:1,pipeline:2000,incomplete:2,overdue:1,followups:1,balance:8000});
 assert.ok(readableDate('2026-10-28').includes('2026'));
});
test('record deep links stay on the selected record type even with colliding demo IDs',()=>{
 const data={tasks:[{id:'1',title:'A task'}],contacts:[{id:'1',name:'A lead',stage:'Lead'}]};
 assert.equal(selectedRecord(data,'leads','1').name,'A lead');
 assert.equal(selectedRecord(data,'tasks','1').title,'A task');
 assert.equal(selectedRecord(data,'customers','missing'),undefined);
});
