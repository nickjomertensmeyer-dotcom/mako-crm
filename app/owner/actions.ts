'use server';
import {identity} from '@/lib/workspace';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function provision(form:FormData){const {client}=await identity();const {error}=await client.rpc('provision_workspace',{target:String(form.get('id')),new_plan:String(form.get('plan')),new_status:String(form.get('status'))});if(error)redirect('/owner?message=Unable+to+update+workspace.');revalidatePath('/owner');}

export async function reviewBillingAlert(form:FormData){
 const {client}=await identity();const id=String(form.get('id')||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))redirect('/owner?message=Invalid+billing+alert.');
 const {error}=await client.rpc('review_billing_risk',{target:id});
 if(error)redirect('/owner?message=Unable+to+review+billing+alert.');
 revalidatePath('/owner');
}

export async function archiveBusiness(_previous:{error:string},form:FormData){const {client}=await identity();const {error}=await client.rpc('archive_workspace',{target:String(form.get('id')),confirmed_name:String(form.get('confirmed_name')||''),restore:form.get('restore')==='true'});if(error)return {error:'Unable to update this business. Check the exact name and administrator access. Migration 010 must be applied.'};revalidatePath('/owner');return {error:''};}
