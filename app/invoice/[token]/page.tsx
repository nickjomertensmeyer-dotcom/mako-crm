import {publicInvoice} from '@/lib/invoice-sharing';
import {money,type LineItem} from '@/lib/business-tools';
import {readableDate} from '@/lib/boards';
import {DocumentBranding,documentBorder} from '@/components/document-branding';
export const dynamic='force-dynamic';
export const metadata={title:'Your invoice',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function InvoicePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 let result;
 try{result=await publicInvoice(token);}catch{return <main className="onboarding"><section className="panel"><h1>Invoice temporarily unavailable</h1><p>Please try again later or contact the business that sent your link.</p></section></main>;}
 if(!result)return <main className="onboarding"><section className="panel"><h1>This invoice link is unavailable</h1><p>It may have expired or been replaced. Ask the business for a new link.</p></section></main>;
 const {document:d,payUrl}=result;
 const balance=d.status==='Paid'?0:Math.max(0,Number(d.total_cents)-Number(d.paid_cents));
 return <main className="onboarding">
  <section className="panel customized-document public-invoice" style={{borderColor:documentBorder(d.design)}}>
   <DocumentBranding design={d.design}/>
   <p className="eyebrow">{d.issuer}</p>
   <h1>Invoice {d.number}</h1>
   <p>Prepared for {d.customer?.name}{d.customer?.company?` · ${d.customer.company}`:''}</p>
   <p>Invoice date {readableDate(d.issued_date)} · Payment due {readableDate(d.due_date)}</p>
   <div className="table-scroll"><table><thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>{(d.items as LineItem[]).map((item,i)=><tr key={i}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unit_cents)}</td><td>{money(item.total_cents)}</td></tr>)}</tbody></table></div>
   <div className="amount-summary"><div><span>Subtotal</span><strong>{money(d.subtotal_cents)}</strong></div><div><span>Tax ({d.tax_bps/100}%)</span><strong>{money(d.tax_cents)}</strong></div><div className="grand-total"><span>Total</span><strong>{money(d.total_cents)}</strong></div><div><span>Paid</span><strong>{money(d.paid_cents)}</strong></div><div><span>Balance due</span><strong>{money(balance)}</strong></div></div>
   {d.notes&&<p style={{whiteSpace:'pre-wrap'}}>{d.notes}</p>}
   {balance===0?<p className="notice" role="status"><strong>Paid in full.</strong> Thank you!</p>
    :payUrl?<div className="document-actions"><a className="primary" href={payUrl} rel="noopener noreferrer">Pay {money(balance)} now</a></div>
    :<p className="notice" role="status">To pay this invoice, please contact {d.issuer}. Online payment is not available for this invoice yet.</p>}
   <p className="small-copy muted">Payments are processed securely by Stripe. Prepared with Mako · {d.issuer}</p>
  </section>
 </main>;
}
