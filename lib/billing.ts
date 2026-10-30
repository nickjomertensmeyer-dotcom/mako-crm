import 'server-only';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';
export function billingTable(){return process.env.STRIPE_LIVE_MODE==='true'?'workspace_live_billing':'workspace_billing';}
export const billingReady=()=>Boolean(process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PRO_PRICE_ID&&process.env.STRIPE_PORTAL_CONFIGURATION_ID&&process.env.SUPABASE_SECRET_KEY&&process.env.NEXT_PUBLIC_SITE_URL);
export function billingClient(){if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Billing not configured');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});}
export function stripeClient(){
 const secret=process.env.STRIPE_SECRET_KEY;
 if(!secret)throw new Error('Billing not configured');
 return new Stripe(secret,{apiVersion:'2026-09-30.endive',timeout:15000,maxNetworkRetries:2});
}
export async function stripeRequest<T>(path:string,params?:Record<string,string>,key?:string):Promise<T>{
 return stripeClient().rawRequest(params?'POST':'GET',`/v1/${path}`,params,{...(key?{idempotencyKey:key}:{})}) as Promise<T>;
}
export type StripeSubscription={id:string;status:string;cancel_at_period_end:boolean;items:{data:{price:{id:string;unit_amount:number|null;currency:string;recurring:{interval:string;interval_count:number}|null};current_period_end?:number}[]}};
export async function subscriptions(customer:string){return stripeRequest<{data:StripeSubscription[]}>(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);}
export function billingOrigin(){const url=new URL(process.env.NEXT_PUBLIC_SITE_URL!);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Invalid billing site URL');return url.origin;}
