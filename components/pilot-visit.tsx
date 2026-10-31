'use client';
import {useEffect} from 'react';
export function PilotVisit(){
 useEffect(()=>{
  let last='';let busy=false;
  const record=async()=>{const day=new Date().toISOString().slice(0,10);if(document.visibilityState!=='visible'||last===day||busy)return;busy=true;try{const r=await fetch('/api/pilot-activity',{method:'POST'});if(r.ok)last=day;}catch{/* Analytics must not interrupt work. */}finally{busy=false;}};
  void record();document.addEventListener('visibilitychange',record);const timer=setInterval(record,60000);
  return()=>{document.removeEventListener('visibilitychange',record);clearInterval(timer);};
 },[]);return null;
}
