import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectRows,emptyView} from '../lib/boards.ts';
const rows=[{id:'internal-id-secret',version:1,name:'Harbor Studio',email:'team@example.com',stage:'Customer',custom_values:{custom_region:'North County',custom_units:120}},{id:'second',version:1,name:'Archived contact',stage:'Customer',archived_at:'2026-10-01',custom_values:{custom_region:'North County'}}];
test('board search finds custom text and numeric values, trims whitespace, and respects archive filters',()=>{
 assert.deepEqual(selectRows(rows,{...emptyView,search:'  NORTH county  '},'customers').map(r=>r.id),['internal-id-secret']);
 assert.equal(selectRows(rows,{...emptyView,search:'120'},'customers').length,1);
 assert.equal(selectRows(rows,{...emptyView,search:'   '},'customers').length,1);
 assert.equal(selectRows(rows,{...emptyView,search:'north',archived:true},'customers')[0].id,'second');
 assert.equal(selectRows(rows,{...emptyView,search:'internal-id-secret'},'customers').length,0);
});
