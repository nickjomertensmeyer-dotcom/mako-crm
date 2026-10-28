import { AuthShell } from '@/components/auth-shell';
import { login } from '../auth/actions';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  if(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){const client=await supabase();const {data}=await client.auth.getUser();if(data.user)redirect('/workspace');}
  const { message } = await searchParams;
  return <AuthShell><div className="auth-form"><div className="icon-tile"><LockKeyhole size={22} /></div><p className="eyebrow">WELCOME BACK TO MAKO</p><h2>Your next move<br />starts here.</h2><p className="muted">Sign in to your business workspace.</p>{message && <p className="notice" role="status">{message}</p>}<form action={login}><label>Work email<input name="email" type="email" placeholder="you@yourbusiness.com" autoComplete="email" required maxLength={254} /></label><label><span className="label-row">Password<a href="/forgot-password">Forgot password?</a></span><input name="password" type="password" placeholder="Enter your password" autoComplete="current-password" required /></label><button className="primary" type="submit">Sign in to your CRM <ArrowRight size={18} /></button></form><p className="secure-note"><LockKeyhole size={13} /> A private workspace for your business.</p><div className="auth-divider" /><p className="access-note">New to Mako?<br /><a href="mailto:makocrm@gmail.com">Let’s set up your workspace <ArrowRight size={14} /></a></p><a className="text-link" href="/preview">Explore the dashboard preview <ArrowRight size={14} /></a></div></AuthShell>;
}
