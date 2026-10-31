"use client";
import {useEffect,useState} from 'react';
import {CheckCircle2,Circle,X} from 'lucide-react';
import type {BoardData} from '@/lib/boards';
export function GettingStarted({data,base,modules,workspaceId}:{data:BoardData;base:string;modules:string[];workspaceId?:string}){
 const key=`mako-started:${base}:${workspaceId||data.userId}`;const [hidden,setHidden]=useState(true),[calendar,setCalendar]=useState(false);
 useEffect(()=>{try{setHidden(localStorage.getItem(key)==='hidden');}catch{setHidden(false);}if(base==='/preview')return;let cancelled=false;fetch('/api/connections').then(r=>r.ok?r.json():null).then(r=>{if(!cancelled)setCalendar(Boolean(r?.apps?.find((a:{id:string;connected:boolean})=>a.id==='google-calendar'&&a.connected)));}).catch(()=>{});return()=>{cancelled=true;};},[key,base]);
 const steps=[{module:'customers',label:'Add your first customer',done:data.contacts.some(r=>r.stage==='Customer'&&!r.archived_at),href:`${base}?view=customers&new=1`},{module:'tasks',label:'Create your first task',done:data.tasks.some(r=>!r.archived_at),href:`${base}?view=tasks&new=1`},{module:'schedule',label:'Connect Google Calendar (optional)',done:calendar,href:`${base}?view=connections`}].filter(step=>modules.includes(step.module));
 if(hidden||steps.every(s=>s.done))return null;
 return <section className="panel getting-started"><div className="panel-title"><h2>Get started</h2><button className="icon-button" aria-label="Dismiss getting started checklist" onClick={()=>{setHidden(true);try{localStorage.setItem(key,'hidden');}catch{/* Browser storage is optional. */}}}><X size={18}/></button></div><p className="muted small-copy">A few steps to make this workspace yours. {steps.filter(s=>s.done).length} of {steps.length} complete.</p><div className="getting-started-steps">{steps.map(s=><a key={s.label} href={s.href}>{s.done?<CheckCircle2 size={20}/>:<Circle size={20}/>}<span>{s.label}</span><span className="sr-only">{s.done?'Complete':'Not complete'}</span></a>)}</div></section>;
}
