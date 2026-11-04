'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Send} from 'lucide-react';
import {scheduleInvoiceReminder,invoiceReminders,shareInvoice} from '@/app/workspace/sales-actions';
import {money,type BusinessDocument} from '@/lib/business-tools';

// Sends the invoice by email using Mako's existing, owner-only, confirmed email queue.
// Nothing is sent until the owner ticks the confirmation box and presses the button.
export function SendInvoice({document:d}:{document:BusinessDocument}){
 const router=useRouter();
 const lines=d.items.map(l=>`- ${l.description} (${l.quantity} x ${money(l.unit_cents)}) = ${money(l.total_cents)}`).join('\n');
 const [ready,setReady]=useState(false),[owner,setOwner]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[sent,setSent]=useState(false),[pageLinked,setPageLinked]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [subject,setSubject]=useState(`Invoice ${d.number} from ${d.issuer}`);
 const intro=`Hello ${d.customer.name},\n\nThank you for your business. Here is invoice ${d.number}:\n\n${lines}\n\nAmount due: {{balance}}\nPayment due: ${d.due_date}\n`;
 const [body,setBody]=useState(`${intro}\nPlease contact us with any questions.\n\nThank you,\n${d.issuer}`);
 useEffect(()=>{let live=true;invoiceReminders(d.id).then(r=>{if(!live)return;setReady(Boolean(r.ready));setOwner(Boolean(r.owner));}).catch(()=>{});return()=>{live=false;};},[d.id]);
 const hasEmail=Boolean(d.customer.email);
 const unpaid=['Issued','Partial'].includes(d.status)&&d.total_cents-d.paid_cents>0;
 async function addPageLink(){
  setBusy(true);setMessage('');
  try{const r=await shareInvoice(d.id);if(r.error||!r.path){setMessage(r.error||'Could not create the customer page link.');return;}
   const url=`${window.location.origin}${r.path}`;
   setBody(b=>b.includes('/invoice/')?b:b.replace('\nPlease contact us',`\nView and pay your invoice online: ${url}\n\nPlease contact us`));setPageLinked(true);
   setMessage('Customer page link added to the message.');}
  catch{setMessage('Could not create the customer page link. Try again.');}finally{setBusy(false);}
 }
 return <details className="panel send-invoice"><summary><Send size={16}/> Send invoice by email</summary>
  <p className="small-copy muted">Emails this invoice to your customer. Nothing is sent until you confirm below. Delivery happens within about 10 minutes, and it stops if the invoice is paid or voided first.</p>
  {!ready&&<p className="notice">Email delivery is not configured yet, so sending is unavailable.</p>}
  {!owner&&<p className="muted">Only the workspace owner can send invoices.</p>}
  {!hasEmail&&<p className="notice">This customer has no email address. Add one to the customer first.</p>}
  {!unpaid&&<p className="notice">Only finalized invoices with a balance can be sent.</p>}
  <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage('');try{const when=new Date(Date.now()+2*60*1000).toISOString();const r=await scheduleInvoiceReminder(d.id,when,subject,body,f.get('confirmed')==='on',requestId);if(r.error){setMessage(r.error);}else{setSent(true);setRequestId(crypto.randomUUID());setMessage(`Invoice queued for ${d.customer.email}. It should arrive within about 10 minutes.`);router.refresh();}}catch{setMessage('Could not confirm the send. Check the Invoice reminders list before retrying.');}finally{setBusy(false);}}}>
   <fieldset disabled={!ready||!owner||!hasEmail||!unpaid||busy||sent}>
    <label>To<input value={d.customer.email||''} readOnly/></label>
    <label>Subject<input value={subject} onChange={e=>setSubject(e.target.value)} minLength={3} maxLength={160} required/></label>
    <label>Message<textarea rows={11} value={body} onChange={e=>setBody(e.target.value)} minLength={10} maxLength={4000} required/></label>
    <button type="button" className="secondary compact" onClick={addPageLink} disabled={pageLinked||busy}>{pageLinked?'Customer page link added':'Add "view and pay online" link'}</button>
    <p className="small-copy muted">Adds a private page where your customer sees this invoice. It shows a Pay now button once you create the payment link in Online payment below. Adding a new link replaces any earlier link for this invoice.</p>
    <details><summary>Preview email</summary><p>To: {d.customer.email||'No email on this invoice'}</p><strong>{subject}</strong><p style={{whiteSpace:'pre-wrap'}}>{body.replaceAll('{{balance}}',money(d.total_cents-d.paid_cents))}</p></details>
    <label className="checkbox-line"><input name="confirmed" type="checkbox" required/>I reviewed this email and want it sent to {d.customer.email||'this customer'}.</label>
    <button className="primary compact" type="submit"><Send size={16}/>{busy?'Queuing…':'Send invoice'}</button>
   </fieldset>
  </form>
  {message&&<p className="notice" role="status">{message}</p>}
 </details>;
}
