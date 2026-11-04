'use server';
import {workspace} from '@/lib/workspace';

// Return only record ids (no customer data) so the sidebar dot can respect dismissed items.
export async function workspaceNeedsAttention():Promise<{invoices:string[];leads:string[]}>{
 const found={invoices:[] as string[],leads:[] as string[]};
 const {client,business}=await workspace();
 const today=new Date().toISOString().slice(0,10);
 if(business.modules.includes('invoices')){
  for(let offset=0;;offset+=500){
   const result=await client.from('business_documents').select('id,total_cents,paid_cents').eq('workspace_id',business.id).eq('kind','Invoice').in('status',['Issued','Partial']).lt('due_date',today).order('id').range(offset,offset+499);
   if(result.error)throw Error('Could not check invoices.');
   for(const d of result.data)if(Number(d.total_cents)>Number(d.paid_cents||0)&&found.invoices.length<200)found.invoices.push(d.id);
   if(result.data.length<500)break;
  }
 }
 if(business.modules.includes('leads')){
  const cutoff=new Date(Date.parse(today+'T23:59:59Z')-7*86400000).toISOString();
  for(let offset=0;;offset+=500){
   const leads=await client.from('contacts').select('id').eq('workspace_id',business.id).eq('stage','Lead').is('archived_at',null).or('pipeline_stage.is.null,pipeline_stage.neq.Won').lte('created_at',cutoff).order('id').range(offset,offset+499);
   if(leads.error)throw Error('Could not check leads.');
   if(!leads.data.length)break;
   const touched=new Set<string>();
   for(let activityOffset=0;;activityOffset+=500){
    const activity=await client.from('record_activity').select('record_id').eq('workspace_id',business.id).in('record_id',leads.data.map(l=>l.id)).gt('created_at',cutoff).order('id').range(activityOffset,activityOffset+499);
    if(activity.error)throw Error('Could not check lead activity.');
    activity.data.forEach(a=>touched.add(a.record_id));
    if(activity.data.length<500)break;
   }
   for(const l of leads.data)if(!touched.has(l.id)&&found.leads.length<200)found.leads.push(l.id);
   if(leads.data.length<500)break;
  }
 }
 return found;
}
