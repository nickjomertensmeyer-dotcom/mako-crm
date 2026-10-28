'use client';
import {useActionState,useEffect,useState} from 'react';
import {resendConfirmation} from '@/app/auth/resend-action';
export function ResendConfirmation({retryAt=0}:{retryAt?:number}){
 const [state,action,pending]=useActionState(resendConfirmation,{message:'',retryAt});
 const [remaining,setRemaining]=useState(0);
 useEffect(()=>{const tick=()=>setRemaining(Math.max(0,Math.ceil((state.retryAt-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[state.retryAt]);
 return <form action={action}><label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="The email you signed up with" required/></label><button className="primary" disabled={pending||remaining>0}>{pending?'Sending…':remaining?`Resend in ${remaining}s`:'Resend confirmation email'}</button>{state.message&&<p className="notice" role="status" style={{marginTop:18}}>{state.message}</p>}<p className="small-copy muted" style={{marginTop:16}}>Check Spam or Junk too. Already confirmed? <a href="/login">Sign in</a> or <a href="/forgot-password">reset your password</a>.</p></form>;
}
