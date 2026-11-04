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
 revalidatePath('/workspace');return {url:`${billingOrigin()}/join?code=${code}`,message:`Invitation created for ${email}. Copy the link and share it with that person. It expires in seven days. No email was sent and no billing changed.`};
}
export async function manageTeamMember(form:FormData){
 const {client,business,role}=await workspace();if(role!=='owner')return;
 const action=String(form.get('action')),item=String(form.get('item'));
 if(!/^[a-f0-9-]{36}$/i.test(item)||!['revoke','remove'].includes(action))return;
 const result=await client.rpc(action==='remove'?'remove_team_member':'revoke_team_invitation',{target:business.id,...(action==='remove'?{member_id:item}:{item})});
 if(result.error)throw Error('The team change could not be saved. Refresh and try again.');revalidatePath('/workspace');
}
