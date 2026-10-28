'use server';
import {cookies} from 'next/headers';
import {supabase} from '@/lib/supabase/server';
import {resendError} from '@/lib/signup-errors';
export async function resendConfirmation(_: {message:string;retryAt:number},form:FormData){
 const email=String(form.get('email')||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return {message:'Enter the valid email address you used to sign up.',retryAt:0};
 const jar=await cookies();const previous=Number(jar.get('mako-confirmation-retry')?.value||0);
 if(previous>Date.now())return {message:'Please wait a minute before requesting another confirmation email.',retryAt:previous};
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin)return {message:'Email confirmation is temporarily unavailable. Contact Mako for help.',retryAt:0};
 const retryAt=Date.now()+60000;
 jar.set('mako-confirmation-retry',String(retryAt),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:60,path:'/'});
 try{
  const client=await supabase();const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:`${origin}/auth/callback`}});
  if(error)return {message:resendError(error),retryAt};
  return {message:'If this email has an unconfirmed account, a new confirmation link is on its way. Check your inbox and Spam folder.',retryAt};
 }catch{return {message:'Could not connect to the email service. Please try again shortly.',retryAt};}
}
