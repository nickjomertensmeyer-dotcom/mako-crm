import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;const actual=request.headers.get('authorization')||'';
 if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 const key=process.env.SUPABASE_SECRET_KEY,apiKey=process.env.RESEND_API_KEY,from=process.env.FOLLOWUP_FROM_EMAIL;
 if(!key||!apiKey||!from||!process.env.NEXT_PUBLIC_SUPABASE_URL)return Response.json({error:'Email worker not configured'},{status:503});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:items,error}=await client.rpc('claim_followups');if(error)return Response.json({error:'Queue unavailable'},{status:503});
 let sent=0,failed=0;
 for(const item of items||[]){
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`mako-followup-${item.id}`},body:JSON.stringify({from,to:[item.recipient],subject:item.subject,text:item.body}),signal:AbortSignal.timeout(10000)});
   if(response.ok){const result=await response.json();const {error:saveError}=await client.from('email_followups').update({status:'Sent',provider_id:result.id}).eq('id',item.id).eq('status','Processing');if(saveError)failed++;else sent++;}
   else{await client.from('email_followups').update({status:'Failed',error:'Email provider rejected the request. Contact Mako.'}).eq('id',item.id);failed++;}
  }catch{await client.from('email_followups').update({status:'Failed',error:'Delivery outcome is uncertain. Ask Mako to check provider logs before resending.'}).eq('id',item.id);failed++;}
 }
 return Response.json({sent,failed},{headers:{'Cache-Control':'no-store'}});
}
