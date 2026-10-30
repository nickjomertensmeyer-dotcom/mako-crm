import {cookies} from 'next/headers';
import {PILOT_COOKIE} from '@/lib/pilot';
import {PasswordField} from '@/components/password-field';
import { AuthShell } from '@/components/auth-shell';
import { login } from '../auth/actions';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  if(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){const client=await supabase();const {data}=await client.auth.getUser();if(data.user)redirect((await cookies()).get(PILOT_COOKIE)?'/pilot':'/workspace');}
  const { message } = await searchParams;
  return <AuthShell><div className="auth-form"><div className="icon-tile"><LockKeyhole size={22} /></div><p className="eyebrow">WELCOME BACK TO MAKO</p><h2>Your next move<br />starts here.</h2><p className="muted">Sign in to your business workspace.</p>{message && <p className="notice" role="status">{message}</p>}<form action={login}><label>Work email<input name="email" type="email" placeholder="you@yourbusiness.com" autoComplete="email" required maxLength={254} /></label><PasswordField/><button className="primary" type="submit">Sign in to your CRM <ArrowRight size={18} /></button></form><p className="secure-note"><LockKeyhole size={13} /> A private workspace for your business.</p><a className="text-link" href="/signup?sent=1">Resend confirmation email →</a><div className="auth-divider" /><p className="access-note">New to Mako?<br /><a href="/signup">Create a Pro account <ArrowRight size={14} /></a></p><a className="text-link" href="https://makocrm.myshopify.com/pages/contact?package=Mako%20Custom">Need Mako Custom? Contact us <ArrowRight size={14}/></a><a className="text-link" href="/preview">Explore the dashboard preview <ArrowRight size={14} /></a></div></AuthShell>;
}
