import {identity} from '@/lib/workspace';
import {billingClient,billingReady} from '@/lib/billing';
import {billingSnapshot} from '@/lib/billing-sync';
import {PRO_TRIAL_OFFER} from '@/lib/pro-trial';
import {invoicePaidThrough} from '@/lib/billing-policy';
import type {OwnerTrialRow} from '@/lib/owner-trials';
import {OwnerTrialDashboard} from './owner-trial-dashboard';
export async function OwnerTrials(){
 const {client}=await identity();const {data:admin}=await client.rpc('is_platform_admin');if(!admin)return null;
 if(!billingReady()||process.env.STRIPE_LIVE_MODE!=='true')return <section className="panel"><h2>Pro trial tracking</h2><p>Live billing must be configured to track customer trials. Sandbox trials are excluded.</p></section>;
 const db=billingClient();const customers:{workspace_id:string;stripe_customer_id:string}[]=[];let offset=0;
 while(true){const {data,error}=await db.from('workspace_live_billing').select('workspace_id,stripe_customer_id').not('stripe_customer_id','is',null).order('workspace_id').range(offset,offset+199);if(error)return <section className="panel"><h2>Pro trial tracking</h2><p role="alert">Trial billing data could not be loaded. Refresh to retry.</p></section>;customers.push(...(data||[]));if(!data||data.length<200)break;offset+=200;}
 const {data:businesses,error}=await client.from('workspaces').select('id,name');if(error)return <section className="panel"><h2>Pro trial tracking</h2><p role="alert">Business names could not be loaded. Refresh to retry.</p></section>;
 const names=new Map((businesses||[]).map(b=>[b.id,b.name]));const rows:OwnerTrialRow[]=[];let errors=0;
 for(let start=0;start<customers.length;start+=5){await Promise.all(customers.slice(start,start+5).map(async customer=>{try{const snapshot=await billingSnapshot(customer.stripe_customer_id);for(const sub of snapshot.subscriptions){if(!sub.livemode||sub.metadata?.mako_trial!==PRO_TRIAL_OFFER||!sub.trial_start||!sub.trial_end||!sub.items.data.some(i=>i.price.id===process.env.STRIPE_PRO_PRICE_ID))continue;const invoice=typeof sub.latest_invoice==='object'?sub.latest_invoice:null;const paidThrough=Math.max(sub.previousPaidThrough||0,invoicePaidThrough(invoice,process.env.STRIPE_PRO_PRICE_ID!));rows.push({id:sub.id,workspaceId:customer.workspace_id,business:names.get(customer.workspace_id)||'Unavailable business',status:sub.status,startsAt:sub.trial_start,endsAt:sub.trial_end,cancelAtEnd:sub.cancel_at_period_end,converted:paidThrough>sub.trial_end});}}catch{errors++;}}));}
 return <OwnerTrialDashboard rows={rows.sort((a,b)=>b.startsAt-a.startsAt)} errors={errors}/>;
}
