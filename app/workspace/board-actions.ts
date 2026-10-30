'use server';
import {workspace} from '@/lib/workspace';
import {revalidatePath} from 'next/cache';
import type {BoardData,BoardName,Column,View} from '@/lib/boards';
export async function loadBoards(recordId?:string):Promise<{data?:BoardData;error?:string}>{
 const {client,business,user,role}=await workspace();
 const names=['tasks','contacts','board_settings','board_views','record_activity','record_comments','workspace_notifications','workflow_rules','workflow_runs','business_documents','work_items','invoice_payments'] as const;
 const results=await Promise.all(names.map(async n=>{
 const cap=n==='record_activity'||n==='record_comments'?2000:10000;
 const data:Record<string,unknown>[]=[];let count=0;
 for(let offset=0;offset<cap;offset+=500){
  const result=await client.from(n).select('*',{count:'exact'}).eq('workspace_id',business.id).order(n==='board_settings'||n==='workflow_rules'?'workspace_id':'created_at',{ascending:false}).range(offset,offset+499);
  if(result.error)return {data:[],count:0,error:result.error};
  data.push(...(result.data||[]));count=result.count||0;if(data.length>=count)break;
 }return {data,count,error:null};
}));
 const [memberResult,reportResult]=await Promise.all([client.rpc('board_member_list',{target:business.id}),client.rpc('workspace_board_report',{target:business.id})]);
 // Optional modules have RLS-filtered empty lists. A missing migration is explicit, never an empty success.
 if(results.some(r=>r.error)||memberResult.error||reportResult.error)return {error:'Connected boards require database migration 005. Existing billing and work tools remain available. Ask the workspace administrator to apply the reviewed migration.'};
 const get=(n:typeof names[number]):Record<string,unknown>[]=>{const records=results[names.indexOf(n)].data||[];return n==='work_items'?records.filter(r=>!r.archived_at):records;};
 if(recordId&&/^[0-9a-f-]{36}$/i.test(recordId)){
  for(const table of ['tasks','contacts'] as const){const selected=await client.from(table).select('*').eq('workspace_id',business.id).eq('id',recordId).maybeSingle();if(selected.data&&!get(table).some(r=>r.id===recordId))get(table).push(selected.data);}
  for(const table of ['record_activity','record_comments'] as const){const selected=await client.from(table).select('*').eq('workspace_id',business.id).eq('record_id',recordId).order('created_at',{ascending:false}).limit(1000);for(const entry of selected.data||[])if(!get(table).some(r=>r.id===entry.id))get(table).push(entry);}
 }
 return {data:{tasks:get('tasks'),contacts:get('contacts'),columns:Object.fromEntries(get('board_settings').map(r=>[r.board,r.columns])),views:get('board_views'),activity:get('record_activity'),comments:get('record_comments'),notifications:get('workspace_notifications'),rules:get('workflow_rules'),runs:get('workflow_runs'),documents:get('business_documents'),work:get('work_items'),payments:get('invoice_payments'),members:memberResult.data||[],userId:user.id,role,report:reportResult.data,limited:results.some(r=>(r.count||0)>(r.data?.length||0))} as unknown as BoardData};
}
async function mutate(name:string,args:Record<string,unknown>){
 const {client,business}=await workspace();
 const {data,error}=await client.rpc(name,{target:business.id,...args});
 if(error){const known=/changed|already exists|valid|Choose|Owner access|Active Pro|Enable this tool|Unsupported|Check|too long|matching/i.test(error.message);return {error:known?error.message:'Unable to save. Check your details and access, then try again.'};}
 revalidatePath('/workspace');return {data};
}
export async function saveBoardRecord(board:BoardName,id:string|null,version:number|null,patch:Record<string,unknown>){return mutate('save_board_record',{board,item_id:id,expected_version:version,patch});}
export async function convertBoardLead(id:string){return mutate('convert_board_lead',{item_id:id});}
export async function saveBoardColumns(board:BoardName,columns:Column[]){return mutate('configure_board',{board_name:board,new_columns:columns});}
export async function saveBoardView(board:BoardName,name:string,personal:boolean,settings:View){return mutate('save_board_view',{board_name:board,view_name:name,personal,view_settings:settings});}
export async function commentBoard(kind:string,id:string,body:string,mentions:string[]){return mutate('add_board_comment',{kind,item_id:id,comment_body:body,mentioned:mentions});}
export async function toggleWorkflow(rule:string,enabled:boolean){return mutate('set_workflow_rule',{rule_name:rule,is_enabled:enabled});}
export async function readNotification(id:string,read:boolean){return mutate('mark_board_notification',{item_id:id,is_read:read});}
