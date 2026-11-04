import 'server-only';
import {createHash} from 'node:crypto';
import {salesDatabase} from '@/lib/quote-sharing';
export function invoiceHash(token:string){return /^[a-f0-9]{64}$/.test(token)?createHash('sha256').update(token).digest('hex'):null;}
// Read-only view for a customer holding a private link. Returns the invoice plus an already-open
// Stripe payment link, if the business created one. It never creates a payment.
export async function publicInvoice(token:string){
 const hash=invoiceHash(token);if(!hash)return null;
 const db=salesDatabase();
 const {data:share}=await db.from('invoice_shares').select('invoice_id,workspace_id,expires_at,revoked').eq('token_hash',hash).maybeSingle();
 if(!share||share.revoked||Date.parse(share.expires_at)<=Date.now())return null;
 const {data:workspace}=await db.from('workspaces').select('status,plan,archived_at,modules').eq('id',share.workspace_id).maybeSingle();
 if(!workspace||workspace.archived_at||workspace.status!=='active'||!['pro','custom'].includes(workspace.plan)||!workspace.modules.includes('invoices'))return null;
 const {data:document}=await db.from('business_documents').select('id,kind,number,issuer,customer,issued_date,due_date,items,tax_bps,subtotal_cents,tax_cents,total_cents,paid_cents,status,notes,design').eq('workspace_id',share.workspace_id).eq('id',share.invoice_id).eq('kind','Invoice').in('status',['Issued','Partial','Paid']).maybeSingle();
 if(!document)return null;
 const {data:checkout}=await db.from('invoice_checkouts').select('checkout_url,state').eq('invoice_id',document.id).eq('state','open').not('checkout_url','is',null).maybeSingle();
 const payUrl=checkout?.checkout_url&&/^https:\/\/checkout\.stripe\.com\//.test(checkout.checkout_url)?checkout.checkout_url:null;
 return {document,payUrl};
}
