import {createHash} from 'node:crypto';
export type SyncInvoice={id:string;kind:string;status:string;customer_id:string|null;customer:{name:string;email?:string;company?:string};number:string;issued_date:string;due_date:string;currency?:string;tax_cents:number;subtotal_cents:number;total_cents:number;items:{description:string;quantity:number;unit_cents:number;total_cents:number}[]};
export const accountingHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function accountingMarker(kind:string,wid:string,source:string){return `MK${kind[0]}-${accountingHash([wid,source]).slice(0,16)}`;}
export function invoiceSyncIssue(invoice:SyncInvoice){
 if(invoice.kind!=='Invoice'||!['Issued','Partial','Paid'].includes(invoice.status))return 'Only issued invoices can be synced. Drafts, quotes and void invoices are excluded.';
 if((invoice.currency||'USD')!=='USD')return 'Only USD invoices are supported by this mapping.';
 if(invoice.tax_cents!==0)return 'Taxed invoices need a reviewed QuickBooks tax mapping before they can sync.';
 if(!Number.isSafeInteger(invoice.total_cents)||invoice.total_cents<1||invoice.total_cents!==invoice.subtotal_cents||!invoice.items.length||invoice.items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isSafeInteger(i.total_cents)||i.total_cents<0)||invoice.items.reduce((n,i)=>n+i.total_cents,0)!==invoice.total_cents)return 'Invoice totals are inconsistent. Review this invoice before syncing.';
 return '';
}
export function invoiceSyncPayload(invoice:SyncInvoice,customerId:string,itemId:string,wid:string){
 const issue=invoiceSyncIssue(invoice);if(issue)throw new Error(issue);
 return {DocNumber:accountingMarker('Invoice',wid,invoice.id),CustomerRef:{value:customerId},TxnDate:invoice.issued_date,DueDate:invoice.due_date,CurrencyRef:{value:'USD'},PrivateNote:`Mako invoice ${invoice.number} | ${wid}:${invoice.id}`,EmailStatus:'NotSet',AllowOnlineCreditCardPayment:false,AllowOnlineACHPayment:false,
 Line:invoice.items.map(i=>({Amount:i.total_cents/100,Description:i.description,DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:{value:itemId},Qty:i.quantity,TaxCodeRef:{value:'NON'}}}))};
}
export function paymentSyncPayload(payment:{id:string;amount_cents:number;payment_date:string;reference?:string},invoiceId:string,customerId:string,depositId:string,wid:string){
 if(!Number.isSafeInteger(payment.amount_cents)||payment.amount_cents<=0)throw new Error('Invalid recorded payment.');
 return {CustomerRef:{value:customerId},TotalAmt:payment.amount_cents/100,TxnDate:payment.payment_date,PaymentRefNum:accountingMarker('Payment',wid,payment.id),PrivateNote:`Mako recorded payment | ${wid}:${payment.id}`,DepositToAccountRef:{value:depositId},Line:[{Amount:payment.amount_cents/100,LinkedTxn:[{TxnId:invoiceId,TxnType:'Invoice'}]}]};
}
