import type {BoardData} from './boards';
export type DetailingOpportunity={id:string;contactId:string;name:string;title:string;reason:string;kind:'quote'|'rebook';date:string};
const day=/^\d{4}-\d{2}-\d{2}$/;
export function detailingFollowups(data:BoardData,today:string,rebookDays=30):DetailingOpportunity[]{
 if(!day.test(today)||!Number.isInteger(rebookDays)||rebookDays<7||rebookDays>365)return [];
 const age=(value:string)=>day.test(value)?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(value+'T12:00:00Z'))/86400000):-1;
 const results:DetailingOpportunity[]=[];
 for(const c of data.contacts.filter(c=>!c.archived_at)){
  if(c.followup_date||data.tasks.some(t=>!t.archived_at&&!t.completed&&t.status!=='Done'&&t.contact_id===c.id))continue;
  const futureWork=data.work.some(w=>w.customer_id===c.id&&['Planned','In progress'].includes(w.status));
  if(futureWork)continue;
  const quote=data.documents.filter(d=>d.customer_id===c.id&&d.kind==='Quote'&&d.status==='Issued'&&age(d.issued_date||'')>=3).sort((a,b)=>(b.issued_date||'').localeCompare(a.issued_date||''))[0];
  const name=String(c.name||'Customer');
  if(quote){results.push({id:'quote-'+quote.id,contactId:c.id,name,title:`Follow up on quote ${quote.number||''} — ${name}`,reason:'Issued at least 3 days ago; no active job or follow-up is recorded.',kind:'quote',date:quote.issued_date!});continue;}
  if(c.stage!=='Customer')continue;
  const job=data.work.filter(w=>w.customer_id===c.id&&w.kind==='Job'&&w.status==='Completed'&&day.test(w.scheduled_date||'')).sort((a,b)=>(b.scheduled_date||'').localeCompare(a.scheduled_date||''))[0];
  if(job&&age(job.scheduled_date!)>=rebookDays)results.push({id:'rebook-'+job.id,contactId:c.id,name,title:`Check in about another visit — ${name}`,reason:`Last completed job was scheduled ${job.scheduled_date}. Review whether another visit is appropriate.`,kind:'rebook',date:job.scheduled_date!});
 }
 return results.sort((a,b)=>a.date.localeCompare(b.date));
}
