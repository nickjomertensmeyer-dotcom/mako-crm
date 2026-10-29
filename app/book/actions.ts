'use server';
import {createClient} from '@supabase/supabase-js';
function publicClient(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});}
export async function reserveAppointment(slot:string,name:string,email:string,requestId:string){const {data,error}=await publicClient().rpc('reserve_booking',{slot,guest:name,address:email,request_id:requestId});return error?{error:error.message}:{data:data as {id:string;cancel:string}};}
export async function cancelAppointment(token:string){const {error}=await publicClient().rpc('cancel_booking',{token});return error?{error:'This cancellation link is invalid or unavailable.'}:{ok:true};}
