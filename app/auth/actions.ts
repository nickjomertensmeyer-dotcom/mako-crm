'use server';
import {cookies} from 'next/headers';
import {googleAuthCallback,GOOGLE_AUTH_COOKIE} from '@/lib/google-auth';
import {PILOT_COOKIE} from '@/lib/pilot';
import {TEAM_COOKIE} from '@/lib/team';
import {PLAN_COOKIE} from '@/lib/plan-selection';
import {planById} from '@/lib/plans';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
import { signupError } from '@/lib/signup-errors';
const message = (path: string, text: string) => redirect(`${path}?message=${encodeURIComponent(text)}`);
export async function signup(form:FormData){
 const plan=planById(form.get('plan'));if(plan)(await cookies()).set(PLAN_COOKIE,plan.id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:86400});
 const email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>128||password!==form.get('confirm'))message('/signup','Use a valid email and matching passwords of 12–128 characters.');
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin)message('/signup','Account setup is temporarily unavailable. Please try again shortly.');
 const client=await supabase();const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:`${origin}/auth/callback`}});
 if(error){
  console.warn('Mako signup failed',{code:error.code||'unknown',status:error.status});
  message('/signup',signupError(error));
 }
 if(data.session)redirect((await cookies()).has(TEAM_COOKIE)?'/join':(await cookies()).get(PILOT_COOKIE)?'/pilot':'/onboarding');
 redirect('/signup?sent=1');
}
export async function login(form: FormData) {
  const client = await supabase();
  const { error } = await client.auth.signInWithPassword({ email: String(form.get('email') || '').trim(), password: String(form.get('password') || '') });
  if (error) message('/login', 'We couldn’t sign you in. Check your email and password, or reset your password.');
  redirect((await cookies()).has(TEAM_COOKIE)?'/join':(await cookies()).get(PILOT_COOKIE)?'/pilot':'/workspace');
}
export async function logout() { const client = await supabase(); await client.auth.signOut(); redirect('/login'); }
export async function requestReset(form: FormData) {
  const client = await supabase();
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) message('/forgot-password', 'Password reset is not configured yet. Contact Mako for help.');
  const {error}=await client.auth.resetPasswordForEmail(String(form.get('email') || '').trim(), { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if(error){
    console.warn('Mako password reset request failed',{code:error.code||'unknown',status:error.status});
    message('/forgot-password',error.status===429?'Please wait a few minutes before requesting another reset email.':'We could not request a reset email right now. Try again shortly.');
  }
  message('/forgot-password', 'If an account exists for that email, you’ll receive a reset link shortly.');
}
export async function resetPassword(form: FormData) {
  const password = String(form.get('password') || '');
  if (password.length < 12 || password !== form.get('confirm')) message('/reset-password', 'Use at least 12 characters and make sure both passwords match.');
  const client = await supabase();
  const { data } = await client.auth.getUser();
  if (!data.user) message('/forgot-password', 'Your reset link has expired. Request a new one.');
  const { error } = await client.auth.updateUser({ password });
  if (error) message('/reset-password', 'Unable to update your password. Request a fresh reset link.');
  await client.auth.signOut();
  message('/login', 'Password updated. Sign in with your new password.');
}

export async function googleAuth(form:FormData){
 const plan=planById(form.get('plan'));if(plan)(await cookies()).set(PLAN_COOKIE,plan.id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:86400});
 const intent=form.get('intent')==='signup'?'signup':'login';
 const path=intent==='signup'?'/signup':'/login';
 let url:string|undefined;
 try{
  const callback=googleAuthCallback(process.env.NEXT_PUBLIC_SITE_URL);
  const store=await cookies();
  store.set(GOOGLE_AUTH_COOKIE,intent,{httpOnly:true,secure:new URL(callback).protocol==='https:',sameSite:'lax',path:'/auth/callback',maxAge:600});
  const client=await supabase();
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback,queryParams:{prompt:'select_account'}}});
  if(!error)url=data.url;
 }catch{/* Return a safe, actionable message without exposing OAuth configuration. */}
 if(!url){(await cookies()).delete({name:GOOGLE_AUTH_COOKIE,path:'/auth/callback'});return message(path,'Google sign-in is temporarily unavailable. Please continue with email or try again shortly.');}
 redirect(url);
}
