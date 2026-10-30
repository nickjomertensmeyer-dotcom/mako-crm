'use client';
import {useState} from 'react';
import {Trash2} from 'lucide-react';
import type {GoogleEvent} from '@/lib/google-calendar-model';
export function GoogleEventDelete({event,calendarId}:{event:GoogleEvent;calendarId:string}){
 const [open,setOpen]=useState(false),[scope,setScope]=useState('occurrence'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/google-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',calendarId,eventId:event.id,etag:event.etag,scope})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not delete the Google event.');
   window.dispatchEvent(new Event('mako-google-calendar-changed'));
  }catch(error){setError(error instanceof Error?error.message:'Could not delete the Google event.');}finally{setBusy(false);}
 }
 return <div className="google-delete-control"><button type="button" className="icon-button" aria-label={`Delete Google event ${event.title}`} aria-expanded={open} onClick={()=>setOpen(!open)} disabled={busy}><Trash2 size={15}/></button>{open&&<div className="google-delete-confirm"><strong>Delete “{event.title}” from Google Calendar?</strong><p>This removes the original Google event, not just its display in Mako. It will not go to Mako Trash. Google will notify guests of the cancellation.</p>{event.recurring&&<label>Delete<select value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="occurrence">Only this occurrence</option><option value="series">Entire recurring series</option></select></label>}{scope==='series'&&<p className="calendar-connection-error">Every occurrence in this series will be deleted, including dates outside this view.</p>}<div className="google-delete-actions"><button type="button" className="secondary compact" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="secondary compact google-delete-final" disabled={busy} onClick={remove}>{busy?'Deleting…':scope==='series'?'Delete entire series':'Delete from Google'}</button></div>{error&&<div className="calendar-connection-error" role="alert">{error}</div>}</div>}</div>;
}
