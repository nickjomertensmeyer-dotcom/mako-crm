// Shared, public contract. Never put provider credentials in this module.
export const finAllowances = {starter:50,pro:250,team:600} as const;
export type FinAction={kind:'task'|'appointment'|'quote';title:string;contact_id:string|null;date:string|null;time:string|null;notes:string;lines:{service_id:string;quantity:number}[]};
export type FinContext={contacts:{id:string;name:string;stage:string}[];services:{id:string;name:string;unit_cents:number}[]};
export const finSchema={type:'object',additionalProperties:false,properties:{answer:{type:'string'},action:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['task','appointment','quote']},title:{type:'string'},contact_id:{type:['string','null']},date:{type:['string','null']},time:{type:['string','null']},notes:{type:'string'},lines:{type:'array',items:{type:'object',additionalProperties:false,properties:{service_id:{type:'string'},quantity:{type:'number'}},required:['service_id','quantity']}}},required:['kind','title','contact_id','date','time','notes','lines']}]}},required:['answer','action']};
export function validateFinResult(value:unknown,context:FinContext){
 if(!value||typeof value!=='object')throw Error('Fin could not prepare this request.');
 const result=value as {answer:string;action:FinAction|null};
 if(typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>3500)throw Error('Please try a shorter request.');
 if(result.action===null)return {answer:result.answer,action:null,cost:1};
 const a=result.action;
 if(!a||!['task','appointment','quote'].includes(a.kind)||typeof a.title!=='string'||!a.title.trim()||a.title.length>160||typeof a.notes!=='string'||a.notes.length>1000||!Array.isArray(a.lines)||a.lines.length>10)throw Error('Fin could not prepare a valid action.');
 if(a.contact_id!==null&&!context.contacts.some(c=>c.id===a.contact_id))throw Error('Choose an existing customer by name.');
 if(a.date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!Number.isFinite(Date.parse(a.date))||new Date(a.date).toISOString().slice(0,10)!==a.date))throw Error('Please specify a valid date.');
 if(a.time!==null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time))throw Error('Please specify a valid local time.');
 if(a.kind==='appointment'&&(!a.date||!a.time))throw Error('Please include the appointment date and local time.');
 if(a.kind==='quote'&&(!a.contact_id||!a.date||!a.lines.length))throw Error('An estimate needs an existing customer, validity date, and saved service.');
 if(a.kind!=='quote'&&a.lines.length)throw Error('Unexpected estimate lines.');
 const lines=a.lines.map(l=>{const service=context.services.find(s=>s.id===l.service_id);if(!service||!Number.isFinite(l.quantity)||l.quantity<=0||l.quantity>10000||Math.round(l.quantity*100)!==l.quantity*100)throw Error('Use a saved service and valid quantity.');return {service_id:l.service_id,description:service.name,quantity:l.quantity,unit_cents:service.unit_cents};});
 return {answer:result.answer,action:{...a,title:a.title.trim(),lines},cost:a.kind==='task'?1:3};
}
