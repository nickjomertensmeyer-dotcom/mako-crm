'use client';
import {useEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2,Minus,RotateCcw,Send,X} from 'lucide-react';
import {SharkyIcon} from './sharky-icon';
import {useRouter} from 'next/navigation';
import type {ChatMessage} from '@/lib/sharky';
import type {FinAction} from '@/lib/fin';
import {finActionNames} from '@/lib/fin-actions';
type Preview={request_id:string;cost:number;customer:string|null;action:Omit<FinAction,'lines'>&{lines:{service_id:string;description:string;quantity:number;unit_cents:number}[]}};
export function FinAiPanel({active,expanded,onExpand,onMinimize,onHide}:{active:boolean;expanded:boolean;onExpand:()=>void;onMinimize:()=>void;onHide:()=>void}){
 const router=useRouter();
 const input=useRef<HTMLTextAreaElement>(null),log=useRef<HTMLDivElement>(null);
 const [balance,setBalance]=useState<{remaining:number;allowance:number;resets_at?:string;paid?:boolean;sandbox?:boolean}|null>(null),[consent,setConsent]=useState(false),[question,setQuestion]=useState(''),[messages,setMessages]=useState<ChatMessage[]>([]),[preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<{id:string;kind:string;view?:string;navigate?:boolean;preferences?:Record<string,unknown>}|null>(null);
 async function refresh(){try{const r=await fetch('/api/assistant',{cache:'no-store'});if(r.ok){const data=await r.json();setBalance(data);if(data.pending)setPreview(data.pending);}}catch{/* Keep the prior balance. */}}
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{if(active)input.current?.focus({preventScroll:true});},[active]);
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight;},[messages,pending,preview,saved]);
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
  try{const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:preview.request_id,confirm})});const data=await r.json();if(!r.ok){if(data.reset_preview)setPreview(null);throw Error(data.error||'Could not save.');}if(confirm){setSaved(data.result);if(data.result?.preferences)window.dispatchEvent(new CustomEvent('mako-fin-preferences',{detail:data.result.preferences}));if(data.result?.navigate&&data.result.view)router.push('/workspace?view='+encodeURIComponent(data.result.view));router.refresh();}setPreview(null);}
  catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setPending(false);void refresh();}
 }
 const view=saved?.view||(saved?.kind==='task'?'tasks':saved?.kind==='quote'?'quotes':'schedule');
 return <><header><SharkyIcon size={30}/><div><h2>Fin</h2><p>Ask a question. Get work done.</p></div><button type="button" aria-label="Start a new Fin chat" title="New chat" disabled={pending||Boolean(preview)} onClick={()=>{setMessages([]);setQuestion('');setSaved(null);setError('');input.current?.focus();}}><RotateCcw size={17}/></button><button type="button" aria-label={expanded?'Collapse Fin chat':'Expand Fin chat'} title={expanded?'Collapse':'Expand'} onClick={onExpand}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button><button type="button" aria-label="Minimize Fin" title="Minimize" onClick={onMinimize}><Minus size={18}/></button><button type="button" aria-label="Hide Fin completely" title="Hide Fin" onClick={onHide}><X size={17}/></button></header>
 <details className="fin-credit-details"><summary>{balance?`${balance.remaining} / ${balance.allowance} credits available`:'Loading credits…'}</summary><p>Answers and everyday changes: 1 credit. Work, document drafts, and workspace items: 3. Confirm changes before saving. Cancelled or failed actions release credits. No automatic overage charges.</p>{balance?.resets_at&&<p>Resets {new Date(balance.resets_at).toLocaleDateString()}. Shared by your business.</p>}{balance?.sandbox&&<p>QA workspace · paid sandbox credits. No real subscription payment was taken.</p>}</details>
 <div className="sharky-messages fin-ai-messages" ref={log} role="log" aria-label="Fin conversation" aria-live="polite">
  {!messages.length&&!preview&&<div className="sharky-welcome"><h3>How can I help?</h3><p>Ask how to use Mako, manage your records, or change your settings.</p></div>}
  {!consent&&<div className="sharky-notice"><p>Fin uses OpenAI with your message, recent chat, business type, selected contact names, task/job titles, document references, workspace item labels, and saved services/prices. <a href="/privacy#fin-ai" target="_blank" rel="noreferrer">Privacy details</a></p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Allow this data for this chat</label></div>}
  {balance&&!balance.paid&&<p className="sharky-notice">Credits activate after a successful subscription payment. Free trials and pilots do not include paid AI credits.</p>}
  {messages.map((m,i)=><article className={`sharky-message ${m.role}`} key={i}><strong>{m.role==='user'?'You':'Fin'}</strong><p>{m.content.split(/(\*\*[^*\n]+\*\*)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<b key={index}>{part.slice(2,-2)}</b>:part)}</p></article>)}
  {preview&&<section className="fin-action-preview" aria-label="Review Fin action"><strong>Review before saving · {preview.cost} {preview.cost===1?'credit':'credits'}</strong><p>{finActionNames[preview.action.kind]||'Review change'}: {preview.action.title}</p>{preview.customer&&<p>Customer: {preview.customer}</p>}{preview.action.date&&<p>{preview.action.kind==='quote'?'Valid until':'Date'}: {preview.action.date} {preview.action.time||''}</p>}{preview.action.notes&&<p>{preview.action.notes}</p>}{preview.action.display?.map((field,i)=><p key={'field-'+i}><strong>{field.label}:</strong> {field.value}</p>)}{preview.action.lines.map((l,i)=><p key={i}>{l.description} × {l.quantity} — ${(l.quantity*l.unit_cents/100).toFixed(2)}</p>)}{['quote','invoice'].includes(preview.action.kind)&&<p>Draft only. Review tax and terms before issuing.</p>}{['appointment','job'].includes(preview.action.kind)&&<p>Uses local schedule time. This does not change Google Calendar or check conflicts.</p>}<div className="fin-action-buttons"><button type="button" disabled={pending} onClick={()=>void finish(true)}>Confirm &amp; save</button><button type="button" disabled={pending} onClick={()=>void finish(false)}>Cancel</button></div><small>Preview expires after 15 minutes.</small></section>}
  {saved&&<p className="fin-action-saved" role="status">{saved.preferences?'Your appearance has been updated.':saved.navigate?'Page opened.':'Saved in Mako.'} {!saved.preferences&&<a href={`/workspace?view=${view}`}>View {saved.kind==='quote'?'estimate':'result'} →</a>}</p>}
  {pending&&<p role="status">{preview?'Saving your choice…':'Fin is preparing your request…'}</p>}{error&&<p className="sharky-error" role="alert">{error}</p>}
 </div>{!messages.length&&!preview&&<div className="sharky-suggestions">{['How do I create an estimate?','Create a follow-up task'].map(text=><button type="button" key={text} disabled={pending} onClick={()=>{setQuestion(text);input.current?.focus();}}>{text}</button>)}</div>}<form onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="fin-ai-question">Message Fin</label><textarea id="fin-ai-question" ref={input} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={2} placeholder="Ask a question or tell Fin what to do…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} disabled={pending||Boolean(preview)}/><button type="submit" aria-label="Send message to Fin" disabled={pending||!consent||Boolean(preview)||!question.trim()||!balance?.remaining}><Send size={18}/></button></form></>;
}
