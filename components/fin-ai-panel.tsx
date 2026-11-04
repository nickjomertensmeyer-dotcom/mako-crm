'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ChatMessage} from '@/lib/sharky';
import type {FinAction} from '@/lib/fin';
type Preview={request_id:string;cost:number;customer:string|null;action:Omit<FinAction,'lines'>&{lines:{service_id:string;description:string;quantity:number;unit_cents:number}[]}};
export function FinAiPanel({onClose}:{onClose:()=>void}){
 const router=useRouter();
 const [balance,setBalance]=useState<{remaining:number;allowance:number;resets_at?:string;paid?:boolean;sandbox?:boolean}|null>(null),[consent,setConsent]=useState(false),[question,setQuestion]=useState(''),[messages,setMessages]=useState<ChatMessage[]>([]),[preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<{id:string;kind:string}|null>(null);
 async function refresh(){try{const r=await fetch('/api/assistant',{cache:'no-store'});if(r.ok)setBalance(await r.json());}catch{/* Keep the prior balance. */}}
 useEffect(()=>{void refresh();},[]);
 async function send(){
  if(pending||preview||!consent||!question.trim())return;
  setPending(true);setError('');setSaved(null);const text=question.trim();
  try{
   const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text,history:messages.slice(-6).map(m=>({...m,content:m.content.slice(0,1900)})),request_id:crypto.randomUUID(),consent:true})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Fin is unavailable.');
   setMessages(old=>[...old,{role:'user',content:text},{role:'assistant',content:data.answer}]);setQuestion('');
   if(data.action)setPreview(data);
  }catch(e){setError(e instanceof Error?e.message:'Fin could not complete this request.');}finally{setPending(false);void refresh();}
 }
 async function finish(confirm:boolean){
  if(!preview||pending)return;setPending(true);setError('');
  try{const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:preview.request_id,confirm})});const data=await r.json();if(!r.ok){if(data.reset_preview)setPreview(null);throw Error(data.error||'Could not save.');}if(confirm){setSaved(data.result);router.refresh();}setPreview(null);}
  catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setPending(false);void refresh();}
 }
 const view=saved?.kind==='task'?'tasks':saved?.kind==='quote'?'quotes':'schedule';
 return <><header><div><h2>Fin AI</h2><p>{balance?`${balance.remaining} / ${balance.allowance} credits available`:'Loading credits…'}</p></div><button type="button" onClick={onClose}>Free help</button></header><div className="sharky-messages fin-ai-messages" role="log" aria-live="polite">
  {!consent&&<div className="sharky-notice"><strong>Your workspace, with your permission.</strong><p>Fin sends your message, recent chat, business type, up to 30 contact names and 20 saved service names/prices to OpenAI. Do not enter sensitive information. <a href="/privacy#fin-ai" target="_blank" rel="noreferrer">AI data details</a></p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Allow this data for this chat</label></div>}
  <p className="sharky-notice">Answers and task drafts: 1 credit. Appointment and estimate drafts: 3. Changes require your confirmation. Cancelled or failed actions release credits. Provider usage is still subject to spending limits.</p>
  {balance?.sandbox&&<p className="sharky-notice">QA workspace · credits from a paid sandbox subscription. No real subscription payment was taken.</p>}
  {balance&&!balance.paid&&<p className="sharky-notice">Credits activate after a successful subscription payment. Free trials and pilots do not include paid AI credits.</p>}
  {balance?.resets_at&&<small>Resets {new Date(balance.resets_at).toLocaleDateString()}. Allowance shared by your business; no automatic overage charges.</small>}
  {messages.map((m,i)=><article className={`sharky-message ${m.role}`} key={i}><strong>{m.role==='user'?'You':'Fin'}</strong><p>{m.content}</p></article>)}
  {preview&&<section className="fin-action-preview" aria-label="Review Fin action"><strong>Review before saving · {preview.cost} {preview.cost===1?'credit':'credits'}</strong><p>{preview.action.kind==='quote'?'Draft estimate':preview.action.kind==='task'?'Task':'Mako appointment'}: {preview.action.title}</p>{preview.customer&&<p>Customer: {preview.customer}</p>}{preview.action.date&&<p>{preview.action.kind==='quote'?'Valid until':'Date'}: {preview.action.date} {preview.action.time||''}</p>}{preview.action.notes&&<p>{preview.action.notes}</p>}{preview.action.lines.map((l,i)=><p key={i}>{l.description} × {l.quantity} — ${(l.quantity*l.unit_cents/100).toFixed(2)}</p>)}{preview.action.kind==='quote'&&<p>Draft only. Review tax and terms before issuing.</p>}{preview.action.kind==='appointment'&&<p>Uses local schedule time. This does not change Google Calendar or check conflicts.</p>}<div className="fin-action-buttons"><button type="button" disabled={pending} onClick={()=>void finish(true)}>Confirm &amp; save</button><button type="button" disabled={pending} onClick={()=>void finish(false)}>Cancel</button></div><small>Preview expires after 15 minutes.</small></section>}
  {saved&&<p className="fin-action-saved" role="status">Saved in Mako. <a href={`/workspace?view=${view}`}>View {saved.kind==='quote'?'estimate':saved.kind} →</a></p>}
  {pending&&<p role="status">{preview?'Saving your choice…':'Fin is preparing your request…'}</p>}{error&&<p className="sharky-error" role="alert">{error}</p>}
 </div><form onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="fin-ai-question">Ask Fin AI</label><textarea id="fin-ai-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={2} placeholder="Create a task to call a customer…" disabled={pending||Boolean(preview)}/><button type="submit" disabled={pending||!consent||Boolean(preview)||!question.trim()||!balance?.remaining}>Send</button></form></>;
}
