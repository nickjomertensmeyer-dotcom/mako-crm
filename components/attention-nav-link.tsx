'use client';
import {useEffect,useState} from 'react';
import {AlertCircle} from 'lucide-react';
import {WorkspaceLink} from './workspace-link';
import {workspaceNeedsAttention} from '@/app/workspace/attention-actions';
import {attentionItems} from '@/lib/workspace-attention';
import {localDay} from '@/lib/boards';
import {demoBoards} from '@/lib/demo-boards';
import {onDismissalsChange,readDismissed,syncDismissals} from '@/lib/attention-dismissed';

export function AttentionNavLink({demo,current,modules,workspaceId}:{demo:boolean;current:string;modules:string[];workspaceId?:string}){
 const [records,setRecords]=useState<string[]>([]),[connections,setConnections]=useState<string[]>([]),[dismissed,setDismissed]=useState<Set<string>>(new Set());
 useEffect(()=>{const sync=()=>setDismissed(readDismissed());sync();if(!demo)void syncDismissals();return onDismissalsChange(sync);},[demo]);
 const moduleKey=modules.join(',');
 useEffect(()=>{
  let cancelled=false,request=0;
  const enabled=moduleKey.split(',');
  async function refresh(){
   const version=++request;
   if(demo){
    let data=demoBoards();
    try{const saved=sessionStorage.getItem('mako-board-demo-v5-lawn');if(saved)data=JSON.parse(saved);}catch{/* Use the demo defaults when storage is unavailable. */}
    if(!cancelled){const found=attentionItems(data,data.report?.today||localDay(),enabled);setRecords([...found.leads.map(l=>`lead:${l.id}`),...found.invoices.map(d=>`invoice:${d.id}`)]);}
    return;
   }
   const [recordResult,connectionResult]=await Promise.allSettled([
    workspaceNeedsAttention(),
    fetch('/api/connections',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();return (data.apps as {id:string;reconnect?:boolean}[]).filter(app=>app.reconnect).map(app=>`conn:${app.id}`);})
   ]);
   if(cancelled)return;
   if(version===request&&recordResult.status==='fulfilled')setRecords([...recordResult.value.leads.map(id=>`lead:${id}`),...recordResult.value.invoices.map(id=>`invoice:${id}`)]);
   if(connectionResult.status==='fulfilled')setConnections(connectionResult.value);
  }
  const update=(event:Event)=>{
   if(event instanceof CustomEvent&&typeof event.detail?.hasAttention==='boolean'){
    ++request;if(event.detail.hasAttention)void refresh();else setRecords([]);
   }else void refresh();
  };
  void refresh();window.addEventListener('focus',refresh);window.addEventListener('mako-attention-update',update);window.addEventListener('mako-demo-reset',refresh);window.addEventListener('mako-google-calendar-changed',refresh);
  return()=>{cancelled=true;window.removeEventListener('focus',refresh);window.removeEventListener('mako-attention-update',update);window.removeEventListener('mako-demo-reset',refresh);window.removeEventListener('mako-google-calendar-changed',refresh);};
 },[demo,current,moduleKey,workspaceId]);
 if(![...records,...connections].some(key=>!dismissed.has(key)))return null;
 return <WorkspaceLink className={current==='attention'?'active':''} aria-current={current==='attention'?'page':undefined} href={`${demo?'/preview':'/workspace'}?view=attention`}><AlertCircle size={19}/><span>Needs attention</span><span className="attention-nav-dot" aria-hidden="true"/></WorkspaceLink>;
}
