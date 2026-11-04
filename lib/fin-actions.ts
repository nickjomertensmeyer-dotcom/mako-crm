import {operationKinds,validateOperation} from './operations.ts';
import type {FinAction,FinContext} from './fin.ts';
export const extendedFinKinds=['customer','lead','update_contact','update_task','preferences','navigate','service','operation','work_status','document_status','checklist','stock','reschedule_work','trash_work','restore_work','update_service','archive_service'] as const;
export const finViews=['overview','customers','leads','tasks','quotes','invoices','schedule','jobs','assets','recurring','booking','projects','inventory','team','connections','business-settings','settings','plan','support','followups','notifications'] as const;
export const finActionNames:Record<string,string>={task:'Create task',appointment:'Create appointment',job:'Create job',quote:'Draft estimate',invoice:'Draft invoice',customer:'Add customer',lead:'Add lead',update_contact:'Update contact',update_task:'Update task',preferences:'Change your appearance',navigate:'Open page',service:'Save service',operation:'Save workspace item',work_status:'Update work status',document_status:'Update document status',checklist:'Add checklist item',stock:'Adjust inventory',reschedule_work:'Reschedule',trash_work:'Move to Trash',restore_work:'Restore from Trash',update_service:'Update service',archive_service:'Archive service'};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid action details.');return value as Record<string,unknown>;};
const text=(value:unknown,max=200)=>{if(typeof value!=='string'||value.length>max)throw Error('Check the action details.');return value.trim();};
const fields=(data:Record<string,unknown>,allowed:string[])=>{if(Object.keys(data).some(k=>!allowed.includes(k)))throw Error('Unsupported action field.');};
export function finData(action:FinAction){try{return object(action.data_json?JSON.parse(action.data_json):{});}catch{throw Error('Fin could not prepare valid action details.');}}
export function extendedFinAction(a:FinAction,ctx:FinContext){
 if(a.lines.length)throw Error('Unexpected document lines.');
 const data=finData(a);let cost=1;const display:{label:string;value:string}[]=[];
 if(a.kind==='customer'||a.kind==='lead'||a.kind==='update_contact'){
  fields(data,['record_id','first_name','last_name','email','phone','company','birthday','followup_date','notes']);
  const contact=a.kind==='update_contact'?ctx.contacts.find(c=>c.id===data.record_id):null;
  if(a.kind==='update_contact'&&(!contact||!contact.version))throw Error('Search for the contact before changing it.');
  if(a.kind!=='update_contact'&&!text(data.first_name,120))throw Error('A first name is required.');
  for(const k of ['first_name','last_name','email','phone','company','birthday','followup_date','notes'])if(k in data){const v=text(data[k],k==='notes'?1000:k==='email'?254:120);data[k]=v;
   if(k==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('Please provide a complete email address.');
   if(k==='phone'&&v&&(!/^[+()\d\s.-]+$/.test(v)||v.replace(/\D/g,'').length<10||v.replace(/\D/g,'').length>15))throw Error('Please provide a complete phone number.');
   if(['birthday','followup_date'].includes(k)&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('Please provide a valid date.');
   if(k==='birthday'&&v&&(v<'1900-01-01'||v>new Date().toISOString().slice(0,10)))throw Error('Birthday must be in the past.');
   display.push({label:k.replaceAll('_',' '),value:v||'Clear field'});
  }
  if(a.kind==='update_contact'&&!display.length)throw Error('Specify what should change.');
  if(contact){data.expected_version=contact.version;data.stage=contact.stage;display.unshift({label:'Contact',value:contact.name});}
 }else if(a.kind==='update_task'){
  fields(data,['record_id','title','status','priority','due_date','description']);const task=ctx.tasks?.find(t=>t.id===data.record_id);
  if(!task)throw Error('Search for the task before changing it.');
  for(const k of ['title','status','priority','due_date','description'])if(k in data){const v=text(data[k],k==='description'?1000:200);data[k]=v;if(k==='status'&&!['To do','In progress','Blocked','Done'].includes(v)||k==='priority'&&!['Low','Normal','High','Urgent'].includes(v))throw Error('Choose a valid task status or priority.');if(k==='due_date'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))))throw Error('Use a valid due date.');display.push({label:k.replaceAll('_',' '),value:v||'Clear field'});}
  if(!display.length)throw Error('Specify what should change.');data.expected_version=task.version;display.unshift({label:'Task',value:task.title});
 }else if(a.kind==='preferences'){
  fields(data,['appearance','density','reduced_motion']);if(!Object.keys(data).length)throw Error('Choose an appearance change.');
  if('appearance'in data&&!['light','dark','system'].includes(String(data.appearance))||'density'in data&&!['comfortable','compact'].includes(String(data.density))||'reduced_motion'in data&&typeof data.reduced_motion!=='boolean')throw Error('Choose a supported appearance setting.');
  for(const [label,value]of Object.entries(data))display.push({label:label.replaceAll('_',' '),value:String(value)});
 }else if(a.kind==='navigate'){
  fields(data,['view']);if(!finViews.includes(data.view as typeof finViews[number]))throw Error('Choose a Mako page.');display.push({label:'Page',value:String(data.view)});
 }else if(a.kind==='service'){
  fields(data,['unit_cents','description']);if(!Number.isSafeInteger(data.unit_cents)||Number(data.unit_cents)<0||Number(data.unit_cents)>100000000)throw Error('Give the service price in cents.');data.description=text(data.description,200);if(!data.description)throw Error('Add a service description.');display.push({label:'Price',value:`$${(Number(data.unit_cents)/100).toFixed(2)}`},{label:'Description',value:String(data.description)});
 }else if(a.kind==='operation'){
  fields(data,['kind','details','status']);const def=operationKinds[String(data.kind)];if(!def)throw Error('Choose a supported workspace item.');
  const old=data.record_id?ctx.operations?.find(o=>o.id===data.record_id):null;if(data.record_id&&!old)throw Error('Search for the workspace item first.');
  const details=object(data.details);for(const value of Object.values(details))if(typeof value!=='string')throw Error('Use text values for workspace fields.');
  validateOperation({id:old?.id||'',version:old?.version||0,kind:String(data.kind),title:a.title,customer_id:a.contact_id,work_id:null,status:String(data.status||'Active'),notes:a.notes,details:details as Record<string,string>,archived:false});
  if(!['Active','Paused','Done','Published'].includes(String(data.status||'Active')))throw Error('Choose a valid workspace status.');
  data.expected_version=old?.version||null;data.status=data.status||'Active';cost=3;
  for(const [key,value]of Object.entries(details))display.push({label:def.fields.find(f=>f.key===key)?.label||key,value:String(value)});
  display.unshift({label:'Item type',value:def.label});
 }else if(a.kind==='work_status'||a.kind==='checklist'){
  fields(data,a.kind==='work_status'?['record_id','status']:['record_id','label']);const work=ctx.work?.find(w=>w.id===data.record_id);if(!work)throw Error('Search for the job or appointment first.');
  if(a.kind==='work_status'&&!['Planned','In progress','Completed','Cancelled'].includes(String(data.status)))throw Error('Choose a valid work status.');if(a.kind==='checklist'){data.label=text(data.label,200);if(!data.label)throw Error('Add a checklist label.');}
  display.push({label:'Work',value:work.title},{label:a.kind==='checklist'?'Checklist item':'Status',value:String(data.label||data.status)});data.previous_status=work.status;
 }else if(a.kind==='document_status'){
  fields(data,['record_id','status']);const doc=ctx.documents?.find(d=>d.id===data.record_id);if(!doc)throw Error('Search for the document first.');
  // Sending, charges, refunds and voiding payments stay in their explicit product flows.
  if(!['Issued','Accepted','Declined'].includes(String(data.status)))throw Error('Use the document page for this status change.');
  data.previous_status=doc.status;display.push({label:'Document',value:doc.number},{label:'Status',value:String(data.status)});
 }else if(a.kind==='stock'){
  fields(data,['record_id','quantity','reason']);if(!ctx.operations?.some(o=>o.id===data.record_id&&o.kind==='product')||!Number.isFinite(data.quantity)||Number(data.quantity)===0||Math.abs(Number(data.quantity))>100000)throw Error('Choose an inventory item and valid stock adjustment.');data.reason=text(data.reason,300);if(!data.reason)throw Error('Give a reason for the adjustment.');display.push({label:'Quantity adjustment',value:String(data.quantity)},{label:'Reason',value:String(data.reason)});

 }else if(a.kind==='reschedule_work'||a.kind==='trash_work'||a.kind==='restore_work'){
  fields(data,a.kind==='reschedule_work'?['record_id','date','time','notes']:['record_id']);
  const work=ctx.work?.find(w=>w.id===data.record_id);if(!work)throw Error('Search for the job or appointment first.');
  if(a.kind==='restore_work'?!work.archived_at:Boolean(work.archived_at))throw Error(a.kind==='restore_work'?'That item is not in Trash.':'That item is already in Trash.');
  display.push({label:'Work',value:work.title});
  if(a.kind==='reschedule_work'){
   const d=text(data.date,10),t=text(data.time,5);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw Error('Please specify a valid new date.');
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('Please specify a valid new local time.');
   if('notes'in data)data.notes=text(data.notes,1000);
   data.previous_date=work.scheduled_date||'';data.previous_time=(work.scheduled_time||'').slice(0,5);
   display.push({label:'From',value:`${work.scheduled_date||'unscheduled'} ${(work.scheduled_time||'').slice(0,5)}`.trim()},{label:'To',value:`${d} ${t}`});
  }else display.push({label:'Note',value:a.kind==='trash_work'?'Recoverable from Trash. Nothing is permanently deleted.':'Returns to your schedule.'});
 }else if(a.kind==='update_service'||a.kind==='archive_service'){
  fields(data,a.kind==='update_service'?['record_id','name','description','unit_cents']:['record_id']);
  const service=ctx.services.find(s=>s.id===data.record_id);if(!service)throw Error('Search for the saved service first.');
  display.push({label:'Service',value:service.name});
  if(a.kind==='update_service'){
   if('name'in data){data.name=text(data.name,120);if(!data.name)throw Error('A service name cannot be empty.');display.push({label:'New name',value:String(data.name)});}
   if('description'in data){data.description=text(data.description,200);display.push({label:'Description',value:String(data.description)});}
   if('unit_cents'in data){if(!Number.isSafeInteger(data.unit_cents)||Number(data.unit_cents)<0||Number(data.unit_cents)>100000000)throw Error('Give the service price in cents.');data.previous_unit_cents=service.unit_cents;display.push({label:'Price',value:`$${(service.unit_cents/100).toFixed(2)} → $${(Number(data.unit_cents)/100).toFixed(2)}`});}
   if(display.length<2)throw Error('Specify what should change.');
  }else display.push({label:'Note',value:'Existing quotes and invoices keep their saved prices.'});
 }else throw Error('Unsupported action.');
 return {action:{...a,data,display},cost};
}
