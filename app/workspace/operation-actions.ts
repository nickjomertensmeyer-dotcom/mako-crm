'use server';
import {workspace} from '@/lib/workspace';
import {validateOperation,type Operation} from '@/lib/operations';
import {revalidatePath} from 'next/cache';
export async function saveOperation(item:Operation){
 try{validateOperation(item);}catch(e){return {error:e instanceof Error?e.message:'Check the fields.'};}
 const {client,business}=await workspace();
 const {data,error}=await client.rpc('save_operation',{target:business.id,record_id:item.id||null,expected_version:item.version||null,k:item.kind,label:item.title,customer:item.customer_id||null,work:item.work_id||null,state:item.status,memo:item.notes,payload:item.details,is_archived:item.archived});
 if(error)return {error:error.message};revalidatePath('/workspace');return {data:data as Operation};
}
export async function stockAction(id:string,quantity:number,reason:string,requestId:string){
 const {client,business}=await workspace();if(!Number.isFinite(quantity)||!reason.trim()||reason.length>300)return {error:'Enter a quantity and reason.'};
 const {error}=await client.rpc('move_stock',{target:business.id,item:id,delta:quantity,memo:reason,request_id:requestId});if(error)return {error:error.message};revalidatePath('/workspace');return {ok:true};
}
export async function receivePurchase(id:string){const {client,business}=await workspace();const {error}=await client.rpc('receive_purchase',{target:business.id,item:id});if(error)return {error:error.message};revalidatePath('/workspace');return {ok:true};}
export async function cancelWorkspaceBooking(id:string){const {client,business}=await workspace();const {error}=await client.rpc('cancel_workspace_booking',{target:business.id,item:id});if(error)return {error:error.message};revalidatePath('/workspace');return {ok:true};}
