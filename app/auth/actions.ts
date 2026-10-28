'use server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
const message = (path: string, text: string) => redirect(`${path}?message=${encodeURIComponent(text)}`);
export async function signup(form:FormData){
 const email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>128||password!==form.get('confirm'))message('/signup','Use a valid email and matching passwords of 12–128 characters.');
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin)message('/signup','Account setup is temporarily unavailable. Please try again shortly.');
 const client=await supabase();const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:`${origin}/auth/callback`}});
 if(error)message('/signup','Unable to create an account. Try signing in if you already registered, or try again shortly.');
 if(data.session)redirect('/onboarding');
 redirect('/signup?sent=1');
}
export async function login(form: FormData) {
  const client = await supabase();
  const { error } = await client.auth.signInWithPassword({ email: String(form.get('email') || '').trim(), password: String(form.get('password') || '') });
  if (error) message('/login', 'We couldn’t sign you in. Check your email and password, or reset your password.');
  redirect('/workspace');
}
export async function logout() { const client = await supabase(); await client.auth.signOut(); redirect('/login'); }
export async function requestReset(form: FormData) {
  const client = await supabase();
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) message('/forgot-password', 'Password reset is not configured yet. Contact Mako for help.');
  await client.auth.resetPasswordForEmail(String(form.get('email') || '').trim(), { redirectTo: `${origin}/auth/callback?next=/reset-password` });
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
