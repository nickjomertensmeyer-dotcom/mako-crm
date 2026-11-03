import type {BoardData} from './boards';
import {daysSince,lastLeadTouch} from './sales-workflows.ts';

export function attentionItems(data:BoardData,today:string,modules:readonly string[]){
 const leads=modules.includes('leads')?data.contacts.filter(c=>c.stage==='Lead'&&!c.archived_at&&c.pipeline_stage!=='Won'&&(daysSince(lastLeadTouch(c,data.activity),today)??0)>=7):[];
 const invoices=modules.includes('invoices')?data.documents.filter(d=>d.kind==='Invoice'&&['Issued','Partial'].includes(d.status)&&d.due_date&&d.due_date<today&&Number(d.total_cents)>Number(d.paid_cents||0)):[];
 return {leads,invoices,hasAttention:leads.length+invoices.length>0};
}
