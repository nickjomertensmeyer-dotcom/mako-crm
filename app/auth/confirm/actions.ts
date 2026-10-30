'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {supabase} from '@/lib/supabase/server';
import {PILOT_COOKIE} from '@/lib/pilot';
import {emailConfirmation,confirmationDestination} from '@/lib/email-confirmation';
export async function confirmEmailLink(form:FormData){
 const input=emailConfirmation(form.get('token_hash'),form.get('type'));
 if(!input)redirect('/auth/confirm?error=invalid');
 const client=await supabase();const {error}=await client.auth.verifyOtp(input);
 if(error){
  console.warn('Mako email verification failed',{code:error.code||'unknown',status:error.status});
  redirect(`/auth/confirm?error=${error.status===429?'limited':error.status&&error.status>=500?'service':'invalid'}&type=${input.type}`);
 }
 redirect(confirmationDestination(input.type,(await cookies()).has(PILOT_COOKIE)));
}
