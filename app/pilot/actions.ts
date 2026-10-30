'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {createHash,randomBytes} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {identity} from '@/lib/workspace';
import {PILOT_COOKIE,validPilotCode} from '@/lib/pilot';
export async function createPilot(_: {error:string;link:string},form:FormData){
 const {client}=await identity();const {data:admin}=await client.rpc('is_platform_admin');
 if(!admin)return {error:'Administrator access required.',link:''};
 const email=String(form.get('email')||'').trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {error:'Enter a valid business email.',link:''};
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin)return {error:'Site URL is not configured.',link:''};
 const code=randomBytes(32).toString('hex');
 const {error}=await client.rpc('create_pilot_invitation',{recipient:email,secret_hash:createHash('sha256').update(code).digest('hex')});
 if(error)return {error:'Could not create invitation. An accepted pilot cannot be restarted. Contact Mako if this persists.',link:''};
 revalidatePath('/owner');return {error:'',link:`${new URL(origin).origin}/pilot?code=${code}`};
}
export async function revokePilot(form:FormData){
 const {client}=await identity();const {error}=await client.rpc('revoke_pilot_invitation',{target:String(form.get('id')||'')});
 if(error)redirect('/owner?message=Unable+to+revoke+pilot.');revalidatePath('/owner');
}
export async function beginPilot(form:FormData){
 const code=String(form.get('code')||'');if(!validPilotCode(code))redirect('/pilot?message=Open+your+original+invitation+link.');
 (await cookies()).set(PILOT_COOKIE,code,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:14*86400});
 redirect(form.get('destination')==='login'?'/login':form.get('destination')==='onboarding'?'/onboarding':'/signup');
}
export async function acceptPilot(form:FormData){
 const {client}=await identity();const code=String(form.get('code')||'');
 if(!validPilotCode(code))redirect('/pilot?message=Open+your+original+invitation+link.');
 const {error}=await client.rpc('accept_pilot_invitation',{secret_hash:createHash('sha256').update(code).digest('hex')});
 if(error)redirect(`/pilot?code=${code}&message=${encodeURIComponent('Unable to activate: use the verified invited email, own a new pending workspace, and check that the invitation has not expired or been revoked. Already accepted invitations do not restart the pilot.')}`);
 (await cookies()).delete(PILOT_COOKIE);revalidatePath('/workspace');redirect('/workspace?message=Invitation+accepted.+Your+current+pilot+or+subscription+access+is+shown+below.');
}


