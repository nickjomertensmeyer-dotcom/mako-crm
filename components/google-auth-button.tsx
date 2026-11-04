'use client';
import {useFormStatus} from 'react-dom';
import {googleAuth} from '@/app/auth/actions';
function GoogleButton({intent}:{intent:'login'|'signup'}){
 const {pending}=useFormStatus();
 return <button className="google-auth-button" type="submit" disabled={pending}>
  <GoogleMark/>
  {pending?'Opening Google…':intent==='signup'?'Sign up with Google':'Sign in with Google'}
 </button>;
}
export function GoogleAuthButton({intent,plan}:{intent:'login'|'signup';plan?:string}){
 return <><form action={googleAuth} className="google-auth-form"><input type="hidden" name="intent" value={intent}/>{plan&&<input type="hidden" name="plan" value={plan}/>}<GoogleButton intent={intent}/></form><div className="auth-method-divider"><span>or continue with email</span></div></>;
}

export function GoogleMark(){return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.6c3.9-3.6 6.1-8.9 6.1-15.1Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.2c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.3H5.8a20.1 20.1 0 0 0 0 18.4l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.7 3l5.8-5.7A19.5 19.5 0 0 0 24 3a20.4 20.4 0 0 0-18.2 11.3l6.8 5.3A12 12 0 0 1 24 11.2Z"/></svg>;}
