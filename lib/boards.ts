export type BoardName='tasks'|'leads'|'customers';
export type Column={key:string;label:string;type:'text'|'number'|'currency'|'date'|'status'|'person'|'linked';options?:string[]};
export type Row={id:string;version:number;title?:string;name?:string;stage?:string;completed?:boolean;archived_at?:string|null;custom_values?:Record<string,string|number|null>;[key:string]:unknown};
export type Member={user_id:string;label:string;role:string};
export type SavedView={id:string;board:string;name:string;user_id:string|null;settings:View};
export type View={search:string;filter:string;owner:string;sort:string;desc:boolean;group:string;hidden:string[];order:string[];widths:Record<string,number>;archived:boolean};
export const emptyView:View={search:'',filter:'',owner:'',sort:'',desc:false,group:'',hidden:[],order:[],widths:{},archived:false};
export type Entry={id:string;record_id:string;record_type:string;created_at:string;action?:string;body?:string;author_id?:string;actor_id?:string;details?:Record<string,{from:unknown;to:unknown}>};
export type Notification={id:string;message:string;record_id:string;board:string;read_at:string|null;created_at:string};
export type Rule={rule:string;enabled:boolean};
export type Run={id:string;rule:string;event_key:string;status:string;created_at:string};
export type Related={id:string;customer_id:string|null;kind:string;title?:string;number?:string;status:string;scheduled_date?:string;due_date?:string;total_cents?:number;paid_cents?:number};
export type BoardReport={today:string;metrics:{customers:number;leads:number;pipeline:number;incomplete:number;overdue:number;followups:number;balance:number};statuses:Record<string,number>;workloads:Record<string,number>;pipeline:Record<string,{count:number;value:number}>;payment_days:{payment_date:string;amount_cents:number}[];upcoming:Related[]};
export type BoardData={tasks:Row[];contacts:Row[];members:Member[];columns:Record<string,Column[]>;views:SavedView[];activity:Entry[];comments:Entry[];notifications:Notification[];rules:Rule[];runs:Run[];documents:Related[];work:Related[];payments:{id:string;payment_date:string;amount_cents:number}[];userId:string;role:string;limited:boolean;report?:BoardReport};
export const fields:Record<BoardName,Column[]>={
 tasks:[{key:'title',label:'Task',type:'text'},{key:'status',label:'Status',type:'status',options:['To do','In progress','Blocked','Done']},{key:'owner_id',label:'Owner',type:'person'},{key:'priority',label:'Priority',type:'status',options:['Low','Normal','High','Urgent']},{key:'due_date',label:'Due date',type:'date'},{key:'contact_id',label:'Related contact',type:'linked'},{key:'description',label:'Description',type:'text'}],
 leads:[{key:'name',label:'Lead',type:'text'},{key:'company',label:'Company',type:'text'},{key:'email',label:'Email',type:'text'},{key:'phone',label:'Phone',type:'text'},{key:'pipeline_stage',label:'Stage',type:'status',options:['New','Contacted','Qualified','Won']},{key:'owner_id',label:'Owner',type:'person'},{key:'estimated_value',label:'Deal value (USD)',type:'currency'},{key:'followup_date',label:'Next follow-up',type:'date'},{key:'notes',label:'Notes',type:'text'}],
 customers:[{key:'name',label:'Customer',type:'text'},{key:'company',label:'Company',type:'text'},{key:'email',label:'Email',type:'text'},{key:'phone',label:'Phone',type:'text'},{key:'relationship_status',label:'Relationship',type:'status',options:['Active','Inactive','Prospect']},{key:'owner_id',label:'Owner',type:'person'},{key:'notes',label:'Notes',type:'text'}]
};
export const valueOf=(row:Row,key:string)=>key.startsWith('custom_')?row.custom_values?.[key]:row[key];
export function localDay(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function readableDate(value:string){return new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(value.length===10?value+'T12:00:00':value));}
export function boardRows(data:BoardData,board:BoardName){return board==='tasks'?data.tasks:data.contacts.filter(r=>r.stage===(board==='leads'?'Lead':'Customer'));}
export function selectedRecord(data:BoardData,current:string,id:string){return (['customers','leads'].includes(current)?data.contacts:current==='tasks'?data.tasks:[...data.tasks,...data.contacts]).find(r=>r.id===id);}
export function selectRows(rows:Row[],view:View,board:BoardName,today=localDay()){
 const statusKey=board==='tasks'?'status':board==='leads'?'pipeline_stage':'relationship_status';
 const filtered=rows.filter(r=>Boolean(r.archived_at)===view.archived&&(!view.search||Object.values(r).some(v=>typeof v==='string'&&v.toLowerCase().includes(view.search.toLowerCase())))&&(!view.owner||(view.owner==='unassigned'?!r.owner_id:r.owner_id===view.owner))&&(!view.filter||(view.filter==='incomplete'?!r.completed:view.filter==='overdue'?!r.completed&&Boolean(r.due_date)&&String(r.due_date)<today:view.filter==='followup'?r.followup_date===today:view.filter==='open'?r.pipeline_stage!=='Won':r[statusKey]===view.filter)));
 if(view.sort)filtered.sort((a,b)=>{const x=valueOf(a,view.sort),y=valueOf(b,view.sort);const n=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),undefined,{numeric:true});return view.desc?-n:n;});return filtered;
}
export function boardMetrics(data:BoardData,today=localDay()){
 const tasks=data.tasks.filter(r=>!r.archived_at),contacts=data.contacts.filter(r=>!r.archived_at),leads=contacts.filter(r=>r.stage==='Lead'&&r.pipeline_stage!=='Won');
 return {customers:contacts.filter(r=>r.stage==='Customer').length,leads:leads.length,pipeline:leads.reduce((s,r)=>s+Number(r.estimated_value||0),0),incomplete:tasks.filter(r=>!r.completed).length,overdue:tasks.filter(r=>!r.completed&&r.due_date&&String(r.due_date)<today).length,followups:contacts.filter(r=>r.followup_date===today).length,balance:data.documents.filter(d=>d.kind==='Invoice'&&!['Draft','Void'].includes(d.status)).reduce((s,d)=>s+Number(d.total_cents||0)-Number(d.paid_cents||0),0)};
}
