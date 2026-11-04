'use client';
import {useEffect,useState} from 'react';
import {CheckCircle2,Phone,PlayCircle,Sun} from 'lucide-react';
import {changeWorkStatus} from '@/app/workspace/business-actions';
import type {WorkItem,CustomerOption} from '@/lib/business-tools';
const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const clock=(time:string|null)=>{if(!time)return 'Any time';const [h,m]=time.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;};
/** Big-button list of today's work for use on a phone: start, finish, call the customer. */
export function TodayBoard({items,contacts,enabled,demo=false}:{items:WorkItem[];contacts:CustomerOption[];enabled:boolean;demo?:boolean}){
 const [today,setToday]=useState('');
 useEffect(()=>{setToday(localDay());},[]);
 if(!today)return null;
 const rows=items.filter(i=>i.scheduled_date===today&&i.status!=='Cancelled'&&!i.archived_at).sort((a,b)=>(a.scheduled_time||'99').localeCompare(b.scheduled_time||'99')||a.title.localeCompare(b.title));
 const done=rows.filter(i=>i.status==='Completed').length,canAct=enabled&&!demo;
 return <section className="panel today-board" aria-labelledby="today-title"><div className="panel-title"><h2 id="today-title"><Sun size={19}/> Today</h2><span className="badge">{rows.length?`${done} of ${rows.length} done`:'Nothing scheduled'}</span></div>
  {rows.length>0&&<div className="today-progress" role="img" aria-label={`${done} of ${rows.length} jobs done today`}><span style={{width:`${Math.round(done/rows.length*100)}%`}}/></div>}
  {rows.length?<div className="today-list">{rows.map(item=>{const customer=contacts.find(c=>c.id===item.customer_id);const finished=item.status==='Completed';
   return <article className="today-card" data-status={item.status} key={item.id}>
    <div className="today-main"><strong>{item.title}</strong><span className="today-time">{clock(item.scheduled_time)} · {item.kind}{customer?` · ${customer.name}`:''}</span>{item.notes&&<p className="small-copy">{item.notes}</p>}</div>
    <div className="today-actions">
     {customer?.phone&&<a className="secondary compact today-call" href={`tel:${customer.phone.replace(/[^+\d]/g,'')}`} aria-label={`Call ${customer.name}`}><Phone size={17}/> Call</a>}
     {finished?<span className="today-done"><CheckCircle2 size={18}/> Done</span>:<form action={changeWorkStatus} className="today-form"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="kind" value={item.kind}/>
      {item.status==='Planned'&&<button className="secondary compact" name="status" value="In progress" disabled={!canAct}><PlayCircle size={17}/> Start</button>}
      <button className="primary compact" name="status" value="Completed" disabled={!canAct}><CheckCircle2 size={17}/> Mark done</button></form>}
    </div></article>;})}</div>:<p className="empty">Nothing scheduled for today. Enjoy the quiet, or add a visit below.</p>}
  {demo&&<p className="small-copy muted">Status buttons are active in your real workspace.</p>}</section>;
}
