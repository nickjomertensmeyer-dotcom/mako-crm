'use client';
import {useActionState,useEffect,useState} from 'react';
import {resendConfirmation} from '@/app/auth/resend-action';
export function ResendConfirmation({retryAt=0}:{retryAt?:number}){
 const [state,action,pending]=useActionState(resendConfirmation,{message:'',retryAt});
 const [remaining,setRemaining]=useState(0);
 useEffect(()=>{const tick=()=>setRemaining(Math.max(0,Math.ceil((state.retryAt-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[state.retryAt]);
 return <form action={action}><aside className="notice" id="confirmation-delivery-help" style={{marginBottom:20}}><strong>Check your Spam or Junk folder</strong><p style={{margin:'8px 0 0'}}>Your setup email may arrive there. Look for an email from Mako, mark it as “Not spam,” and open the newest confirmation link.</p></aside><label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="The email you signed up with" aria-describedby="confirmation-delivery-help" required/></label><button className="primary" disabled={pending||remaining>0}>{pending?'Sending…':remaining?`Resend in ${remaining}s`:'Resend confirmation email'}</button>{state.message&&<p className="notice" role="status" style={{marginTop:18}}>{state.message}</p>}<p className="small-copy muted" style={{marginTop:16}}>Already confirmed? <a href="/login">Sign in</a> or <a href="/forgot-password">reset your password</a>.</p></form>;
}

