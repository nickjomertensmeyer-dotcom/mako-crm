'use client';
import {useSyncExternalStore,useState} from 'react';
const subscribe=()=>()=>{};
export function CookieNotice(){
 const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
 const [dismissed,setDismissed]=useState(false);
 let saved=false;try{saved=ready&&sessionStorage.getItem('mako-cookie-notice-v1')==='dismissed';}catch{/* The notice works without storage. */}
 if(!ready||dismissed||saved)return null;
 return <aside className="cookie-notice" aria-label="Cookies and privacy"><div><strong>Your privacy matters.</strong><p>Mako uses cookies and browser storage for sign-in, security, preferences, and the demo. We do not use advertising cookies or optional analytics scripts.</p><a href="/cookies">Cookie details</a><span aria-hidden="true"> · </span><a href="/privacy">Privacy policy</a></div><button type="button" className="secondary" onClick={()=>{setDismissed(true);try{sessionStorage.setItem('mako-cookie-notice-v1','dismissed');}catch{/* Dismiss for this page when storage is unavailable. */}}}>Dismiss notice</button></aside>;
}
