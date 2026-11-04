'use server';
import {randomBytes,createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {workspace} from '@/lib/workspace';
import {billingOrigin} from '@/lib/billing';
export type TeamResult={error?:string;url?:string;message?:string};
export async function inviteTeamMember(_previous:TeamResult,form:FormData):Promise<TeamResult>{
 const {client,business,role}=await workspace();if(role!=='owner')return {error:'Only the owner can invite users.'};
 const email=String(form.get('email')||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return {error:'Enter a valid email address.'};
 const code=randomBytes(32).toString('hex');const {error}=await client.rpc('create_team_invitation',{target:business.id,recipient:email,secret_hash:createHash('sha256').update(code).digest('hex')});
 if(error)return {error:error.message.includes('seat')?'All paid user seats are used or reserved. Review Plan & data to add seats.':error.message.includes('already')?error.message:'Could not create this invitation. Check your seats and try again.'};
 revalidatePath('/workspace');const url=`${billingOrigin()}/join?code=${code}`;
 // Optional: only when the owner ticks "Also email this invitation". Never claims delivery unless the provider accepted it.
 let emailed=false,emailNote='';
 if(form.get('send_email')==='on'){const key=process.env.RESEND_API_KEY,from=process.env.FOLLOWUP_FROM_EMAIL;
  if(!key||!from)emailNote=' Email delivery is not set up yet, so copy the link and send it yourself.';
  else try{const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`mako-team-invite-${createHash('sha256').update(code).digest('hex').slice(0,32)}`},body:JSON.stringify({from,to:[email],subject:`You are invited to join ${business.name} on Mako`,text:`${business.name} invited you to join their team on Mako CRM.\n\nOpen this private link to create your own login and join:\n${url}\n\nThe link expires in seven days. If you were not expecting this, you can ignore this email.`}),signal:AbortSignal.timeout(15000)});emailed=res.ok;if(!res.ok)emailNote=' The email could not be sent, so copy the link and send it yourself.';}catch{emailNote=' We could not confirm the email was delivered, so copy the link and send it yourself too.';}}
 return {url,message:emailed?`Invitation created for ${email} and emailed to them. The link expires in seven days. No billing changed.`:`Invitation created for ${email}. Copy the link and share it with that person. It expires in seven days. No email was sent and no billing changed.${emailNote}`};
}
export async function manageTeamMember(form:FormData){
 const {client,business,role}=await workspace();if(role!=='owner')return;
 const action=String(form.get('action')),item=String(form.get('item'));
 if(!/^[a-f0-9-]{36}$/i.test(item)||!['revoke','remove'].includes(action))return;
 const result=await client.rpc(action==='remove'?'remove_team_member':'revoke_team_invitation',{target:business.id,...(action==='remove'?{member_id:item}:{item})});
 if(result.error)throw Error('The team change could not be saved. Refresh and try again.');revalidatePath('/workspace');
}
