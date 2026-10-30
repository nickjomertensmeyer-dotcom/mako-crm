import {AuthShell} from '@/components/auth-shell';
import {emailConfirmation} from '@/lib/email-confirmation';
import {confirmEmailLink} from './actions';
export const dynamic='force-dynamic';
export const metadata={title:'Confirm your email link',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({searchParams}:{searchParams:Promise<{token_hash?:string;type?:string;error?:string}>}){
 const p=await searchParams;const input=emailConfirmation(p.token_hash,p.type);const reset=p.type==='recovery'||p.type==='invite';
 return <AuthShell><div className="auth-form"><p className="eyebrow">SECURE ACCOUNT ACCESS</p><h2>{reset?'Reset your password.':'Confirm your email.'}</h2>{input&&!p.error?<><p>Click below to {reset?'continue to choose a new password':'verify your email and continue to Mako'}. This extra step helps prevent email security scanners from using your link before you do.</p><form action={confirmEmailLink}><input type="hidden" name="token_hash" value={input.token_hash}/><input type="hidden" name="type" value={input.type}/><button className="primary">{reset?'Continue to reset password':'Confirm email and continue'}</button></form></>:<><p className="notice" role="alert">{p.error==='limited'?'Too many attempts. Wait a few minutes before trying again.':p.error==='service'?'The account service is temporarily unavailable. Please try again shortly.':'This link is invalid, has already been used, or has expired. Request a new email and open only the newest link.'}</p><a className="primary" href={reset?'/forgot-password':'/signup?sent=1'}>{reset?'Request a new reset email':'Resend confirmation email'}</a></>}<p><a href="/login">Back to sign in</a></p></div></AuthShell>;
}
