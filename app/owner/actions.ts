'use server';
import {identity} from '@/lib/workspace';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function provision(form:FormData){const {client}=await identity();const {error}=await client.rpc('provision_workspace',{target:String(form.get('id')),new_plan:String(form.get('plan')),new_status:String(form.get('status'))});if(error)redirect('/owner?message=Unable+to+update+workspace.');revalidatePath('/owner');}
