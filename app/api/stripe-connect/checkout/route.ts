import {unstable_rethrow} from 'next/navigation';
import {billingClient,billingOrigin,stripeClient} from '@/lib/billing';
import {merchantContext,merchantRecord,merchantStatus,connectLive,connectError} from '@/lib/stripe-connect';
import {boundedBody} from '@/lib/request-body';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 try{
  const ctx=await merchantContext();if(request.headers.get('origin')!==billingOrigin())return json({error:'Reload Mako and try again.'},403);
  if(!process.env.STRIPE_CONNECT_WEBHOOK_SECRET)throw new Error('Invoice payments need their Stripe webhook configured first.');
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));
  if(typeof body.invoiceId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.invoiceId)||!['create','expire'].includes(body.action))return json({error:'Invalid invoice request.'},400);
  // RLS enforces membership and the enabled invoices module before service-role use.
  const invoice=await ctx.client.from('business_documents').select('id,number,status').eq('workspace_id',ctx.business.id).eq('id',body.invoiceId).eq('kind','Invoice').maybeSingle();
  if(invoice.error||!invoice.data)return json({error:'Invoice not found or unavailable.'},404);
  const db=billingClient(),stripe=stripeClient(),live=connectLive();
  const current=await db.from('invoice_checkouts').select('*').eq('workspace_id',ctx.business.id).eq('invoice_id',body.invoiceId).in('state',['creating','open','pending']).maybeSingle();
  if(current.error)throw new Error('Could not check existing checkout.');
  const old=current.data;
  if(old?.live!==undefined&&old.live!==live)throw new Error('Resolve the checkout in its original Stripe environment.');
  if(old?.session_id){
   let session=await stripe.checkout.sessions.retrieve(old.session_id,{}, {stripeAccount:old.account_id});
   if(body.action==='expire'&&session.status==='open')session=await stripe.checkout.sessions.expire(old.session_id,{}, {stripeAccount:old.account_id});
   if(session.status==='expired'){
    const updated=await db.from('invoice_checkouts').update({state:'expired'}).eq('id',old.id).in('state',['creating','open']);if(updated.error)throw new Error('Could not close checkout.');
    if(body.action==='expire')return json({message:'Payment link closed. You can now change the invoice or record a manual payment.'});
   }else if(session.status==='complete')return json({message:'Payment submitted. Awaiting Stripe confirmation; refresh the invoice shortly.'});
   else if(body.action==='create')return json({url:session.url,message:'Existing payment link ready.'});
  }else if(body.action==='expire')return json({error:old?'Checkout creation is unfinished. Retry creating the link first.':'No open payment link.'},409);
  if(body.action==='expire')return json({error:'Pending payments cannot be cancelled here.'},409);
  if(!(await merchantStatus(ctx.business.id)).ready)throw new Error('Finish Stripe setup in Connections before collecting invoice payments.');
  const account=await merchantRecord(ctx.business.id);
  const reserved=await db.rpc('reserve_invoice_checkout',{target:ctx.business.id,item:body.invoiceId,merchant:account!.account_id,is_live:live});
  if(reserved.error)throw new Error('Could not reserve this invoice. It must be finalized, unpaid, and available.');
  const attempt=reserved.data;if(!attempt?.id)throw new Error('Could not prepare checkout.');
  if(Date.now()-new Date(attempt.created_at).getTime()>23*3600000)throw new Error('Mako must review this unfinished payment link before retrying.');
  const session=await stripe.checkout.sessions.create({mode:'payment',integration_identifier:'mako_invoice_rqmfkzpa',
   line_items:[{quantity:1,price_data:{currency:attempt.currency,unit_amount:Number(attempt.amount_cents),product_data:{name:`Invoice ${invoice.data.number}`,description:'Outstanding invoice balance, including any tax recorded on the invoice.'}}}],
   metadata:{mako_checkout:attempt.id},client_reference_id:attempt.id,
   success_url:`${billingOrigin()}/payment-result?result=submitted`,cancel_url:`${billingOrigin()}/payment-result?result=cancelled`,
  },{stripeAccount:attempt.account_id,idempotencyKey:`mako-invoice-${attempt.id}`});
  const saved=await db.from('invoice_checkouts').update({session_id:session.id,checkout_url:session.url,state:'open'}).eq('id',attempt.id).eq('state','creating');
  if(saved.error)throw new Error('Could not save the payment link. Retry to recover it.');
  return json({url:session.url,message:live?'Payment link ready to share with your customer.':'Sandbox payment link ready. Use test payment details only.'});
 }catch(e){unstable_rethrow(e);return json({error:connectError(e)},400);}
}
