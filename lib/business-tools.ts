export type CustomerOption = {id:string;name:string;company?:string;email?:string;phone?:string};
export type LineItem = {description:string;quantity:number;unit_cents:number;total_cents:number};
export type BusinessDocument = {
 id:string;kind:'Invoice'|'Quote';number:string;customer_id:string|null;
 customer:{name:string;company?:string;email?:string;phone?:string};issuer:string;
 issued_date:string;due_date:string;items:LineItem[];tax_bps:number;subtotal_cents:number;
 tax_cents:number;total_cents:number;paid_cents:number;status:string;notes:string;source_quote?:string|null;
};
export type WorkItem = {id:string;kind:'Job'|'Appointment';title:string;customer_id:string|null;scheduled_date:string;scheduled_time:string|null;status:string;notes:string};
export type InvoicePayment = {id:string;invoice_id:string;amount_cents:number;payment_date:string;method:string;reference:string};
export type SaveResult = {error:string};
export type BusinessSummary = {invoice_balance:number;overdue:number;paid_total:number;open_quotes:number;upcoming_work:number;contact_customers:number;contact_leads:number;open_tasks:number};
export const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
// Parse money as decimal strings, without multiplying binary floating point values.
export function decimalCents(value:string):number|null {
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function previewTotals(items:{quantity:string;price:string}[],tax:string){
 const subtotal=items.reduce((sum,item)=>{
  const cents=decimalCents(item.price);const qty=decimalCents(item.quantity)??0;
  return sum+(cents===null?0:Math.round(qty*cents/100));
 },0);
 const bps=decimalCents(tax)??0;const taxCents=Math.round(subtotal*bps/10000);
 return {subtotal,tax:taxCents,total:subtotal+taxCents};
}
