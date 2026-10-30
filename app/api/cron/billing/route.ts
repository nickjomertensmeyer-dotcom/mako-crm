import {timingSafeEqual} from 'node:crypto';
import {billingClient,billingTable,billingReady} from '@/lib/billing';
import {syncBilling} from '@/lib/billing-sync';
export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'';
 if(!secret||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${secret}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${secret}`)))return Response.json({error:'Unauthorized'},{status:401});
 if(!billingReady())return Response.json({error:'Billing not configured'},{status:503});
 const db=billingClient(),bucket=Math.floor(Date.now()/900000),started=Date.now();let checked=0,failed=0,offset=0;
 while(true){
  const {data,error}=await db.from(billingTable()).select('workspace_id,stripe_customer_id').not('stripe_customer_id','is',null).order('workspace_id').range(offset,offset+49);
  if(error)return Response.json({error:'Unable to load billing accounts'},{status:503});
  for(const row of data||[]){
   if(Date.now()-started>240000)return Response.json({error:'Billing reconciliation exceeded its time budget',checked,failed},{status:503});
   try{await syncBilling(row.stripe_customer_id,`reconcile-${process.env.STRIPE_LIVE_MODE==='true'?'live':'test'}-${row.workspace_id}-${bucket}`);checked++;}catch{failed++;}
  }
  if(!data||data.length<50)break;offset+=50;
 }
 return Response.json({checked,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
}
