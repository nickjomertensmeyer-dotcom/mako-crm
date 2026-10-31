'use server';
import {identity} from '@/lib/workspace';
import {revalidatePath} from 'next/cache';
export async function setPilotExcluded(id:string,excluded:boolean){
 const {client}=await identity();
 const {data:admin}=await client.rpc('is_platform_admin');
 if(!admin)return {error:'Owner access required.'};
 if(!/^[0-9a-f-]{36}$/i.test(id)||typeof excluded!=='boolean')return {error:'Invalid invitation.'};
 const {error}=await client.rpc('exclude_pilot_activity',{invitation:id,excluded});
 if(error)return {error:'Could not save the exclusion. Try again.'};
 revalidatePath('/owner');return {error:''};
}
