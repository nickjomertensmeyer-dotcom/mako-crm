"use server";
import {workspace} from '@/lib/workspace';
export async function searchWorkspace(input:string){
 const {client,business}=await workspace();
 if(business.archived_at)return {results:[],error:'This workspace is archived.'};
 const q=input.trim().slice(0,80).replace(/[^\p{L}\p{N} @.-]/gu,'');
 if(q.length<2)return {results:[]};
 const pattern=`%${q}%`,modules:string[]=business.modules;
 const [contacts,tasks,documents]=await Promise.all([
 modules.some(m=>m==='customers'||m==='leads')?client.from('contacts').select('id,name,company,email,stage').eq('workspace_id',business.id).is('archived_at',null).in('stage',modules.includes('customers')?(modules.includes('leads')?['Customer','Lead']:['Customer']):['Lead']).or(`name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`).order('name').limit(15):Promise.resolve({data:[],error:null}),
 modules.includes('tasks')?client.from('tasks').select('id,title').eq('workspace_id',business.id).is('archived_at',null).ilike('title',pattern).order('title').limit(15):Promise.resolve({data:[],error:null}),
 modules.includes('invoices')?client.from('business_documents').select('id,number').eq('workspace_id',business.id).eq('kind','Invoice').ilike('number',pattern).order('created_at',{ascending:false}).limit(15):Promise.resolve({data:[],error:null})]);
 if(contacts.error||tasks.error||documents.error)return {results:[],error:'Search could not load. Please try again.'};
 return {results:[...(contacts.data||[]).map(r=>({id:r.id,label:r.name,type:r.stage,href:`/workspace?view=${r.stage==='Lead'?'leads':'customers'}&record=${r.id}`})),...(tasks.data||[]).map(r=>({id:r.id,label:r.title,type:'Task',href:`/workspace?view=tasks&record=${r.id}`})),...(documents.data||[]).map(r=>({id:r.id,label:r.number,type:'Invoice',href:`/workspace?view=invoices&document=${r.id}`}))]};
}
