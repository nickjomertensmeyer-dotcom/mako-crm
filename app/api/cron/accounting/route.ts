import {connectionComingSoon,quickBooksComingSoonMessage} from '@/lib/connections-model';
import {timingSafeEqual} from 'node:crypto';
import {calendarDatabase} from '@/lib/google-calendar';
import {syncMakoInvoice} from '@/lib/accounting-sync';
export const runtime='nodejs';export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'';if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 if(connectionComingSoon('quickbooks'))return Response.json({skipped:true,reason:quickBooksComingSoonMessage},{headers:{'Cache-Control':'no-store'}});
 const db=calendarDatabase(),claimed=await db.rpc('claim_accounting_queue');if(claimed.error)return Response.json({error:'Accounting queue unavailable.'},{status:503});
 let synced=0,failed=0;const started=Date.now();
 for(const job of claimed.data||[]){
  const scope=()=>db.from('qb_sync_queue').update({claim_token:null,claim_until:null}).eq('invoice_id',job.invoice_id).eq('claim_token',job.claim_token);
  if(Date.now()-started>240000){await scope();continue;}
  try{
   const settings=await db.from('qb_sync_settings').select('owner_id,enabled,automatic').eq('workspace_id',job.workspace_id).maybeSingle();if(!settings.data?.enabled||!settings.data.automatic){await scope();continue;}
   await syncMakoInvoice(job.workspace_id,settings.data.owner_id,job.invoice_id);
   const removed=await db.from('qb_sync_queue').delete().eq('invoice_id',job.invoice_id).eq('claim_token',job.claim_token).eq('version',job.version);if(removed.error)throw new Error('Could not complete queue entry.');await scope();synced++;
  }catch(error){await db.from('qb_sync_queue').update({claim_token:null,claim_until:null,available_at:new Date(Date.now()+15*60000).toISOString(),error:error instanceof Error?error.message:'Sync needs review.'}).eq('invoice_id',job.invoice_id).eq('claim_token',job.claim_token);failed++;}
 }
 return Response.json({synced,failed},{headers:{'Cache-Control':'no-store'}});
}
