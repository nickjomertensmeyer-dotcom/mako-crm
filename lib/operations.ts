export const operationModules=['assets','recurring','booking','projects','inventory'] as const;
export type Field={key:string;label:string;type?:string;options?:string[];required?:boolean;related?:string;when?:string};
export const operationKinds:Record<string,{module:string;label:string;fields:Field[]}>= {
 asset:{module:'assets',label:'Service asset',fields:[{key:'category',label:'Type',options:['Vehicle','Property','Equipment','Pet']},{key:'identifier',label:'Registration / address / serial / breed'},{key:'details',label:'Service details',type:'textarea'},{key:'make_model',label:'Make and model',when:'Vehicle'},{key:'year',label:'Model year',type:'number',when:'Vehicle'},{key:'odometer',label:'Odometer',type:'number',when:'Vehicle'},{key:'area',label:'Area / lot size',when:'Property'},{key:'access',label:'Access instructions',when:'Property'},{key:'model',label:'Equipment model',when:'Equipment'},{key:'care',label:'Pet care instructions',type:'textarea',when:'Pet'}]},
 plan:{module:'recurring',label:'Service plan',fields:[{key:'next_date',label:'Next visit',type:'date',required:true},{key:'frequency',label:'Repeat',options:['Weekly','Monthly']},{key:'timezone',label:'IANA time zone',required:true},{key:'asset',label:'Service asset',related:'asset'},{key:'renewal',label:'Renewal date',type:'date'}]},
 slot:{module:'booking',label:'Bookable appointment',fields:[{key:'starts_at',label:'Start (with time zone)',type:'datetime-local',required:true},{key:'minutes',label:'Duration (minutes)',type:'number',required:true}]},
 project:{module:'projects',label:'Project',fields:[{key:'budget',label:'Cost budget (USD)',type:'number'},{key:'due',label:'Due date',type:'date'}]},
 milestone:{module:'projects',label:'Milestone',fields:[{key:'project',label:'Project',related:'project',required:true},{key:'due',label:'Due date',type:'date'}]},
 time:{module:'projects',label:'Time entry',fields:[{key:'project',label:'Project',related:'project',required:true},{key:'minutes',label:'Minutes worked',type:'number',required:true},{key:'rate',label:'Internal hourly cost (USD)',type:'number'},{key:'date',label:'Work date',type:'date',required:true}]},
 expense:{module:'projects',label:'Expense',fields:[{key:'project',label:'Project',related:'project',required:true},{key:'amount',label:'Cost (USD)',type:'number',required:true},{key:'date',label:'Expense date',type:'date',required:true}]},
 product:{module:'inventory',label:'Inventory item',fields:[{key:'sku',label:'SKU',required:true},{key:'unit',label:'Unit',required:true},{key:'minimum',label:'Low-stock threshold',type:'number'}]},
 supplier:{module:'inventory',label:'Supplier',fields:[{key:'email',label:'Email',type:'email'},{key:'phone',label:'Phone'}]},
 purchase:{module:'inventory',label:'Purchase order',fields:[{key:'supplier',label:'Supplier',related:'supplier',required:true},{key:'product',label:'Item',related:'product',required:true},{key:'quantity',label:'Quantity',type:'number',required:true},{key:'amount',label:'Order cost (USD)',type:'number'},{key:'due',label:'Expected date',type:'date'}]},
};
export type Operation={id:string;kind:string;title:string;customer_id:string|null;work_id:string|null;status:string;notes:string;details:Record<string,string>;version:number;archived:boolean};
export type Movement={id:string;product_id:string;quantity:number;reason:string;created_at:string};
export function validateOperation(item:Operation){
 const def=operationKinds[item.kind];if(!def||!item.title.trim()||item.title.length>160||item.notes.length>2000)throw Error('Enter a title (up to 160 characters) and notes up to 2,000 characters.');
 for(const f of def.fields){const v=item.details[f.key]||'';if((f.required&&!v)||v.length>1000)throw Error(`Check ${f.label}.`);if(v&&f.options&&!f.options.includes(v))throw Error(`Choose ${f.label}.`);if(v&&f.type==='number'&&(!/^\d+(\.\d{1,2})?$/.test(v)||Number(v)>10000000))throw Error(`Use a positive number with up to two decimals for ${f.label}.`);if(v&&f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))))throw Error(`Check ${f.label}.`);}
 if(item.kind==='plan'){try{new Intl.DateTimeFormat('en',{timeZone:item.details.timezone});}catch{throw Error('Use a valid IANA time zone, such as America/Chicago.');}}
 if(item.kind==='slot'&&(!Number.isFinite(Date.parse(item.details.starts_at))||Number(item.details.minutes)<5||Number(item.details.minutes)>480))throw Error('Choose a valid start and a duration of 5–480 minutes.');
 if(['time','purchase'].includes(item.kind)&&Number(item.details[item.kind==='time'?'minutes':'quantity'])<=0)throw Error('Minutes or quantity must be greater than zero.');
 return item;
}
export function projectCosts(records:Operation[],id:string){return records.filter(r=>!r.archived&&r.details.project===id).reduce((sum,r)=>sum+(r.kind==='expense'?Math.round(Number(r.details.amount||0)*100):r.kind==='time'?Math.round(Number(r.details.minutes||0)*Number(r.details.rate||0)*100/60):0),0);}
export function stockOnHand(moves:Movement[],id:string){return Math.round(moves.filter(m=>m.product_id===id).reduce((sum,m)=>sum+Number(m.quantity),0)*100)/100;}
