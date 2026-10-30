import {connectionComingSoon,quickBooksComingSoonMessage} from '@/lib/connections-model';
import {connectionContext} from '@/lib/connections';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {qbCredentials,qbRead} from '@/lib/quickbooks';
import {boundedBody} from '@/lib/request-body';
import {syncMakoInvoice,mapAccountingCustomer} from '@/lib/accounting-sync';
import {invoiceSyncIssue,type SyncInvoice} from '@/lib/accounting-model';
export const runtime='nodejs';export const maxDuration=300;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const id=(v:unknown):v is string=>typeof v==='string'&&/^\d{1,30}$/.test(v);
async function context(){const ctx=await connectionContext();if(ctx.role!=='owner')throw new Error('Only workspace owners can configure accounting sync.');return ctx;}
export async function GET(request:Request){
 if(connectionComingSoon('quickbooks'))return Response.json({error:quickBooksComingSoonMessage},{status:503,headers:{'Cache-Control':'no-store'}});
 try{
  const ctx=await context(),credential=await qbCredentials(ctx.business.id,ctx.user.id),db=calendarDatabase();
  const invoiceId=new URL(request.url).searchParams.get('invoice');
  if(invoiceId){
   if(!/^[0-9a-f-]{36}$/i.test(invoiceId))return json({error:'Choose a valid invoice.'},400);
   const [doc,payments]=await Promise.all([ctx.client.from('business_documents').select('*').eq('workspace_id',ctx.business.id).eq('id',invoiceId).eq('kind','Invoice').maybeSingle(),ctx.client.from('invoice_payments').select('id,amount_cents,payment_date,method').eq('workspace_id',ctx.business.id).eq('invoice_id',invoiceId).order('created_at').limit(100)]);
   if(!doc.data||payments.error)return json({error:'Invoice preview unavailable.'},404);return json({preview:{...doc.data,payments:payments.data,issue:invoiceSyncIssue(doc.data as SyncInvoice)}});
  }
  const [settings,jobs,invoices,items,accounts,customers,queue,diagnostics]=await Promise.all([
   db.from('qb_sync_settings').select('*').eq('workspace_id',ctx.business.id).maybeSingle(),
   db.from('qb_sync_jobs').select('id,kind,source_id,status,remote_id,error,updated_at').eq('workspace_id',ctx.business.id).eq('realm_id',credential.realmId).eq('environment',credential.environment).order('updated_at',{ascending:false}).limit(100),
   ctx.client.from('business_documents').select('*').eq('workspace_id',ctx.business.id).eq('kind','Invoice').order('created_at',{ascending:false}).limit(100),
   qbRead<{QueryResponse?:{Item?:{Id:string;Name:string;Type:string;Active?:boolean}[]}}>(credential,`query?query=${encodeURIComponent('select * from Item maxresults 1000')}`),
   qbRead<{QueryResponse?:{Account?:{Id:string;Name:string;AccountType:string;AccountSubType?:string;Active?:boolean}[]}}>(credential,`query?query=${encodeURIComponent('select * from Account maxresults 1000')}`),
   qbRead<{QueryResponse?:{Customer?:{Id:string;DisplayName:string}[]}}>(credential,`query?query=${encodeURIComponent('select * from Customer maxresults 1000')}`),
   db.from('qb_sync_queue').select('invoice_id,error,attempts,available_at').eq('workspace_id',ctx.business.id).order('available_at').limit(100),
   db.from('qb_api_events').select('reference,operation,status,intuit_tid,code,category,created_at').eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id).eq('environment',credential.environment).order('created_at',{ascending:false}).limit(50)
  ]);
  if(settings.error||jobs.error||invoices.error||queue.error||diagnostics.error)return json({error:'Accounting sync needs its database update or the Invoices tool enabled.'},503);
  return json({environment:credential.environment,deployment:{scheduled:process.env.VERCEL_ENV==='production'&&Boolean(process.env.CRON_SECRET)},settings:settings.data?.realm_id===credential.realmId&&settings.data.environment===credential.environment?settings.data:null,history:jobs.data,queue:queue.data,diagnostics:diagnostics.data,invoices:(invoices.data||[]).map(doc=>({id:doc.id,number:doc.number,customer:doc.customer.name,total:doc.total_cents,issue:invoiceSyncIssue(doc as SyncInvoice)})),items:(items.QueryResponse?.Item||[]).filter(i=>i.Active!==false&&['Service','NonInventory'].includes(i.Type)),accounts:(accounts.QueryResponse?.Account||[]).filter(a=>a.Active!==false&&(a.AccountType==='Bank'||a.AccountSubType==='UndepositedFunds')),customers:customers.QueryResponse?.Customer||[]});
 }catch(error){return json({error:error instanceof Error?error.message:'Could not load accounting sync.'},400);}
}
export async function POST(request:Request){
 if(connectionComingSoon('quickbooks'))return Response.json({error:quickBooksComingSoonMessage},{status:503,headers:{'Cache-Control':'no-store'}});
 try{
  const ctx=await context();if(request.headers.get('origin')!==calendarConfig().origin)return json({error:'Reload Mako and try again.'},403);
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,10000))),credential=await qbCredentials(ctx.business.id,ctx.user.id),db=calendarDatabase();
  if(body.action==='settings'){
   if(!ctx.business.modules.includes('invoices'))return json({error:'Enable Invoices in business settings first.'},400);
   if(typeof body.enabled!=='boolean'||typeof body.automatic!=='boolean'||typeof body.createCustomers!=='boolean'||!id(body.itemId)||!id(body.depositId))return json({error:'Choose your accounting mappings.'},400);
   if(body.enabled&&body.confirm!==true)return json({error:'Confirm that sync creates accounting records and does not charge customers.'},400);
   const [item,account,company]=await Promise.all([qbRead<{Item:{Type:string;Active?:boolean}}>(credential,`item/${body.itemId}`),qbRead<{Account:{AccountType:string;AccountSubType?:string;Active?:boolean}}>(credential,`account/${body.depositId}`),qbRead<{CompanyInfo:{Country?:string}}>(credential,`companyinfo/${credential.realmId}`)]);
   if(!['Service','NonInventory'].includes(item.Item.Type)||item.Item.Active===false||account.Account.Active===false||!(account.Account.AccountType==='Bank'||account.Account.AccountSubType==='UndepositedFunds'))return json({error:'Choose an active service item and a bank or undeposited-funds account.'},400);
   if(body.enabled&&company.CompanyInfo.Country!=='US')return json({error:'This initial mapping supports US QuickBooks companies. Other countries require a reviewed tax mapping.'},400);
   const previous=await db.from('qb_sync_settings').select('realm_id,environment,starts_at').eq('workspace_id',ctx.business.id).maybeSingle();if(previous.error)throw new Error('Could not read sync settings.');
   const same=previous.data?.realm_id===credential.realmId&&previous.data?.environment===credential.environment;
   const result=await db.from('qb_sync_settings').upsert({workspace_id:ctx.business.id,owner_id:ctx.user.id,realm_id:credential.realmId,environment:credential.environment,enabled:body.enabled,automatic:body.enabled&&body.automatic,create_customers:body.createCustomers,service_item_id:body.itemId,deposit_account_id:body.depositId,starts_at:same?previous.data!.starts_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'workspace_id'});
   if(result.error)throw new Error('Could not save accounting settings.');return json({message:body.enabled?'Accounting sync enabled. Review an invoice below before its first sync. New issued invoices are queued when automatic sync is enabled.':'Accounting sync paused. Existing QuickBooks records remain unchanged.'});
  }
  if(body.action==='sync'){
   if(typeof body.invoiceId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.invoiceId)||body.confirm!==true)return json({error:'Choose and confirm an invoice to sync.'},400);
   if(body.customerId){if(!id(body.customerId))return json({error:'Choose a QuickBooks customer.'},400);await mapAccountingCustomer(ctx.business.id,ctx.user.id,body.invoiceId,body.customerId);}
   const result=await syncMakoInvoice(ctx.business.id,ctx.user.id,body.invoiceId);return json({message:`Invoice linked to QuickBooks #${result.remoteInvoice}; ${result.payments} recorded payment(s) confirmed. No charge was made.`,result});
  }
  return json({error:'Choose save settings or sync invoice.'},400);
 }catch(error){return json({error:error instanceof Error?error.message:'Accounting sync failed. Check sync history before retrying.'},400);}
}
