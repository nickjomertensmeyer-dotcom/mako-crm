'use client';
import Image from 'next/image';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {modules as availableModules} from '@/lib/presets';
import type {Business} from './dashboard';
export function BusinessLogo({business,demo=false,large=false}:{business:Business;demo?:boolean;large?:boolean}){
  const path=business.logo_path||'';const source=path?(demo&&path.startsWith('data:image/webp;base64,')?path:!demo&&business.id?`/api/workspace/logo?workspace=${encodeURIComponent(business.id)}&v=${encodeURIComponent(path)}`:''):'';
  const [failed,setFailed]=useState('');
  return <span className={`business-logo${large?' large':''}`}>{source&&failed!==source?<Image src={source} alt="" width={96} height={96} unoptimized onError={()=>setFailed(source)}/>:business.name.slice(0,1).toUpperCase()}</span>;
}
export function useBusinessIdentity(business:Business,demo=false){
  const [preview,setPreview]=useState<Partial<Business>>({});
  useEffect(()=>{if(!demo)return;const update=()=>{try{const saved=sessionStorage.getItem('mako-demo-business');const data=saved?JSON.parse(saved):{};setPreview({name:typeof data.name==='string'?data.name:business.name,logo_path:typeof data.logo_path==='string'&&data.logo_path.startsWith('data:image/webp;base64,')?data.logo_path:'',modules:Array.isArray(data.modules)?data.modules.filter((value:unknown)=>typeof value==='string'&&(availableModules as readonly string[]).includes(value)):business.modules});}catch{setPreview({});}};const reset=()=>setPreview({});update();window.addEventListener('mako-business-updated',update);window.addEventListener('mako-demo-reset',reset);return()=>{window.removeEventListener('mako-business-updated',update);window.removeEventListener('mako-demo-reset',reset);};},[business.name,business.modules,demo]);
  return demo?{...business,...preview}:business;
}
export function BusinessIdentity({business,demo=false}:{business:Business;demo?:boolean}){
  const current=useBusinessIdentity(business,demo);
  return <Link href={`${demo?'/preview':'/workspace'}?view=business-settings`} className="workspace-chip" aria-label={`Open business settings for ${current.name}`}><BusinessLogo business={current} demo={demo}/><div><strong>{current.name}</strong><small>{business.plan==='pending'?'Plan activation required':`Mako ${business.plan}`}</small></div></Link>;
}
