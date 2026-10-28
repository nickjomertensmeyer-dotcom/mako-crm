'use server';
import {workspace} from '@/lib/workspace';
import {identity} from '@/lib/workspace';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function scheduleFollowup(form:FormData){
 const {client,business}=await workspace();
 if(!process.env.RESEND_API_KEY||!process.env.FOLLOWUP_FROM_EMAIL||!process.env.SUPABASE_SECRET_KEY||!process.env.CRON_SECRET)redirect('/workspace?view=followups&message=Email+delivery+is+not+connected+yet.');
 const when=String(form.get('scheduled_at')||'');const date=new Date(when+'Z');
 if(!when||!Number.isFinite(date.valueOf()))redirect('/workspace?view=followups&message=Choose+a+valid+send+time.');
 const {error}=await client.rpc('queue_followup',{target:business.id,customer:String(form.get('contact_id')),email_subject:String(form.get('subject')),email_body:String(form.get('body')),send_at:date.toISOString(),confirmed:form.get('consent')==='on'});
 if(error)redirect('/workspace?view=followups&message=Could+not+schedule.+Check+customer+email,+consent,+send+time,+and+daily+limits.');
 revalidatePath('/workspace');redirect('/workspace?view=followups&message=Follow-up+scheduled.');
}
export async function cancelFollowup(form:FormData){const {client,business}=await workspace();const {error}=await client.rpc('cancel_followup',{target:business.id,item:String(form.get('id'))});if(error)redirect('/workspace?view=followups&message=Could+not+cancel+this+follow-up.');revalidatePath('/workspace');}
export async function requestSupport(form:FormData){const {client,business}=await workspace();const {error}=await client.rpc('request_support',{target:business.id,title:String(form.get('subject')),description:String(form.get('details')),kind:String(form.get('category'))});if(error)redirect('/workspace?view=support&message=Could+not+save+your+request.+Check+the+details+and+your+plan.');revalidatePath('/workspace');redirect('/workspace?view=support&message=Your+request+is+in+the+Mako+priority+queue.');}
export async function updateSupport(form:FormData){const {client}=await identity();const {error}=await client.rpc('update_support',{item:String(form.get('id')),new_status:String(form.get('status'))});if(error)redirect('/owner?message=Could+not+update+support+request.');revalidatePath('/owner');}
export async function moveLead(form:FormData){const {client,business}=await workspace();const {error}=await client.from('contacts').update({pipeline_stage:String(form.get('pipeline_stage'))}).eq('workspace_id',business.id).eq('id',String(form.get('id')));if(error)redirect('/workspace?view=leads&message=Could+not+update+lead.');revalidatePath('/workspace');}
