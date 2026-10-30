'use server';
import {workspace} from '@/lib/workspace';
import {decimalCents,type SaveResult} from '@/lib/business-tools';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
const value=(f:FormData,key:string)=>String(f.get(key)||'').trim();
function back(view:string,text:string,id?:string):never{redirect(`/workspace?view=${view}${id?`&document=${encodeURIComponent(id)}`:''}&message=${encodeURIComponent(text)}`);}
export async function saveDocument(_:SaveResult,form:FormData):Promise<SaveResult>{
 const {client,business}=await workspace();
 const kind=value(form,'kind')==='Quote'?'Quote':'Invoice';const descriptions=form.getAll('description');
 const quantities=form.getAll('quantity');const prices=form.getAll('price');
 if(!descriptions.length||descriptions.length>30)return {error:'Add between 1 and 30 line items.'};
 const items=[];
 for(let i=0;i<descriptions.length;i++){
  const description=String(descriptions[i]).trim();const quantity=String(quantities[i]||'');const cents=decimalCents(String(prices[i]||''));
  if(!description||description.length>200||!/^\d{1,5}(\.\d{1,2})?$/.test(quantity)||Number(quantity)<=0||Number(quantity)>10000||cents===null||cents>100000000)return {error:'Check each description, quantity, and price. Use up to two decimal places.'};
  items.push({description,quantity,unit_cents:cents});
 }
 const bps=decimalCents(value(form,'tax'));
 if(bps===null||bps>10000)return {error:'Enter a tax percentage between 0 and 100.'};
 if(!value(form,'customer_id'))return {error:'Choose a customer first.'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value(form,'date'))||!/^\d{4}-\d{2}-\d{2}$/.test(value(form,'due_date'))||value(form,'due_date')<value(form,'date'))return {error:'The due or expiry date must be on or after the document date.'};
 const {data,error}=await client.rpc('save_business_document',{target:business.id,item_id:value(form,'id')||null,document_kind:kind,customer_uuid:value(form,'customer_id'),document_date:value(form,'date'),deadline:value(form,'due_date'),line_items:items,tax_rate_bps:bps,memo:value(form,'notes')});
 if(error)return {error:'Could not save. Confirm your plan is active, the tool is enabled, and the pre-tax total is $0.01–$1,000,000. Issued documents cannot be edited.'};
 revalidatePath('/workspace');back(kind==='Invoice'?'invoices':'quotes','Draft saved.',data);
}
export async function changeDocumentStatus(form:FormData){
 const {client,business}=await workspace();const view=value(form,'kind')==='Quote'?'quotes':'invoices';
 const {error}=await client.rpc('change_document_status',{target:business.id,item:value(form,'id'),new_status:value(form,'status')});
 if(error)back(view,'Could not update. Check the document status and your workspace access.',value(form,'id'));
 revalidatePath('/workspace');back(view,'Document updated.',value(form,'id'));
}
export async function recordPayment(_:SaveResult,form:FormData):Promise<SaveResult>{
 const {client,business}=await workspace();const cents=decimalCents(value(form,'amount'));
 if(cents===null||cents<=0)return {error:'Enter a payment amount greater than zero, with up to two decimal places.'};
 const {error}=await client.rpc('record_invoice_payment',{target:business.id,item:value(form,'id'),cents,received_on:value(form,'payment_date'),payment_method:value(form,'method'),payment_reference:value(form,'reference'),request_uuid:value(form,'request_id')});
 if(error)return {error:'Could not record payment. Check the remaining balance, payment date, and active plan. Future dates are not allowed.'};
 revalidatePath('/workspace');back('invoices','Payment recorded.',value(form,'id'));
}
export async function convertQuote(form:FormData){
 const {client,business}=await workspace();const {data,error}=await client.rpc('convert_quote_to_invoice',{target:business.id,item:value(form,'id')});
 if(error)back('quotes','Accept the quote and enable the invoices tool first.',value(form,'id'));
 revalidatePath('/workspace');back('invoices','Invoice draft ready. Review it before finalizing.',data);
}
export async function saveWork(_:SaveResult,form:FormData):Promise<SaveResult>{
 const {client,business}=await workspace();const kind=value(form,'kind')==='Job'?'Job':'Appointment';
 if(!value(form,'title')||value(form,'title').length>160||!/^\d{4}-\d{2}-\d{2}$/.test(value(form,'scheduled_date')))return {error:'Enter a title and valid date.'};
 const {error}=await client.rpc('save_work_item',{target:business.id,item_id:value(form,'id')||null,item_kind:kind,item_title:value(form,'title'),customer_uuid:value(form,'customer_id')||null,work_date:value(form,'scheduled_date'),work_time:value(form,'scheduled_time')||null,memo:value(form,'notes')});
 if(error)return {error:'Could not save. Check your details, active plan, and selected workspace tools.'};
 revalidatePath('/workspace');back(kind==='Job'?'jobs':'schedule',`${kind} saved.`);
}
export async function changeWorkStatus(form:FormData){
 const {client,business}=await workspace();const view=value(form,'kind')==='Job'?'jobs':'schedule';
 const {error}=await client.rpc('change_work_status',{target:business.id,item:value(form,'id'),new_status:value(form,'status')});
 if(error)back(view,'Could not change this item. Check workspace access.');
 revalidatePath('/workspace');
}
export async function setWorkTrash(id:string,restore:boolean):Promise<SaveResult>{
 const {client,business}=await workspace();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||typeof restore!=='boolean')return {error:'Choose a valid work item.'};
 const {error}=await client.rpc('set_work_item_trash',{target:business.id,item:id,restore});
 if(error)return {error:'Could not update Trash. Check your active plan, workspace access, and enabled tools.'};
 revalidatePath('/workspace');return {error:''};
}
