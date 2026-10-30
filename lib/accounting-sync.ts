import {connectionComingSoon,quickBooksComingSoonMessage} from './connections-model';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {calendarDatabase} from './google-calendar';
import {qbCredentials,qbRead,qbWrite,QbWriteError} from './quickbooks';
import {accountingHash,accountingMarker,invoiceSyncIssue,invoiceSyncPayload,paymentSyncPayload,type SyncInvoice} from './accounting-model';
type Credential=Awaited<ReturnType<typeof qbCredentials>>;
type Remote={Id:string;TotalAmt?:number;Balance?:number;UnappliedAmt?:number;CustomerRef?:{value:string};PrivateNote?:string;DisplayName?:string;Line?:{Amount?:number;LinkedTxn?:{TxnId:string;TxnType:string}[]}[]};
type Job={id:string;status:string;remote_id:string|null;source_hash:string;payload:Record<string,unknown>;request_id:string;claim_until:string|null};
export type AccountingSettings={workspace_id:string;owner_id:string;realm_id:string;environment:string;enabled:boolean;automatic:boolean;create_customers:boolean;service_item_id:string;deposit_account_id:string;starts_at:string};
async function accountingContext(wid:string,uid:string){
 if(connectionComingSoon('quickbooks'))throw new Error(quickBooksComingSoonMessage);
 const db=calendarDatabase();const [business,member,settings]=await Promise.all([db.from('workspaces').select('status,plan,modules,archived_at').eq('id',wid).maybeSingle(),db.from('memberships').select('role').eq('workspace_id',wid).eq('user_id',uid).maybeSingle(),db.from('qb_sync_settings').select('*').eq('workspace_id',wid).maybeSingle()]);
 if(business.error||member.error)throw new Error('Accounting source access needs its database update.');
 if(!business.data||business.data.archived_at||business.data.status!=='active'||!['pro','custom'].includes(business.data.plan)||!business.data.modules.includes('invoices')||member.data?.role!=='owner')throw new Error('Active owner access and the Invoices tool are required.');
 const setting=settings.data as AccountingSettings|null;if(!setting?.enabled||setting.owner_id!==uid)throw new Error('Enable accounting sync and save your mappings first.');
 const credential=await qbCredentials(wid,uid);if(credential.realmId!==setting.realm_id||credential.environment!==setting.environment)throw new Error('The connected company changed. Review and save sync settings again.');
 return {db,credential,setting};
}
async function queryRemote(credential:Credential,kind:string,field:string,value:string){
 const escaped=value.replace(/\\/g,'\\\\').replace(/'/g,"\\'");const result=await qbRead<{QueryResponse?:Record<string,Remote[]>}>(credential,`query?query=${encodeURIComponent(`select * from ${kind} where ${field} = '${escaped}' maxresults 10`)}`);
 const items=result.QueryResponse?.[kind]||[];if(items.length>1)throw new Error('Multiple QuickBooks records match this Mako reference. Review before syncing.');return items[0];
}
function verifyRemote(kind:string,remote:Remote,payload:Record<string,unknown>){
 if(!remote?.Id)throw new Error('QuickBooks did not return a record ID.');
 if(kind!=='Customer'){
  const total=kind==='Invoice'?(payload.Line as {Amount:number}[]).reduce((n,l)=>n+l.Amount,0):Number(payload.TotalAmt);
  if(Math.round(Number(remote.TotalAmt)*100)!==Math.round(total*100)||remote.CustomerRef?.value!==(payload.CustomerRef as {value:string}).value)throw new Error('QuickBooks totals or customer differ from Mako. The remote record needs review.');
  if(kind==='Payment'){const wanted=((payload.Line as {LinkedTxn:{TxnId:string}[]}[])[0].LinkedTxn[0].TxnId),applied=(remote.Line||[]).filter(l=>l.LinkedTxn?.some(t=>t.TxnId===wanted&&t.TxnType==='Invoice')).reduce((sum,l)=>sum+Math.round(Number(l.Amount||0)*100),0);if(applied!==Math.round(total*100)||Number(remote.UnappliedAmt||0)!==0)throw new Error('QuickBooks payment was not fully applied to the expected invoice. Review it before retrying.');}
 }
}
async function syncRecord(context:Awaited<ReturnType<typeof accountingContext>>,kind:'Customer'|'Invoice'|'Payment',sourceId:string,payload:Record<string,unknown>,beforeWrite?:()=>Promise<void>){
 const {db,credential,setting}=context,scope={workspace_id:setting.workspace_id,realm_id:credential.realmId,environment:credential.environment,kind,source_id:sourceId},sourceHash=accountingHash(payload);
 const inserted=await db.from('qb_sync_jobs').upsert({...scope,source_hash:sourceHash,payload},{onConflict:'workspace_id,realm_id,environment,kind,source_id',ignoreDuplicates:true});if(inserted.error)throw new Error('Could not prepare sync history.');
 const loaded=await db.from('qb_sync_jobs').select('*').match(scope).single();if(loaded.error)throw new Error('Could not load sync history.');const job=loaded.data as Job;
 if(job.source_hash!==sourceHash)throw new Error('This record or its mappings changed after sync was prepared. Review its existing QuickBooks record; Mako will not duplicate or overwrite it.');
 if(job.status==='Synced'&&job.remote_id)return job.remote_id;
 if(job.status==='Processing'&&job.claim_until&&Date.parse(job.claim_until)>Date.now())throw new Error('This record is already syncing. Try again shortly.');
 const field=kind==='Invoice'?'DocNumber':kind==='Payment'?'PaymentRefNum':'DisplayName',marker=String(payload[field]);
 const found=await queryRemote(credential,kind,field,marker);
 if(found){verifyRemote(kind,found,payload);const saved=await db.from('qb_sync_jobs').update({status:'Synced',remote_id:found.Id,error:'',claim_token:null,claim_until:null,updated_at:new Date().toISOString()}).eq('id',job.id);if(saved.error)throw new Error('QuickBooks record exists, but its Mako link could not be saved.');return found.Id;}
 if(['Review','Processing'].includes(job.status)){
  await db.from('qb_sync_jobs').update({status:'Review',error:'Previous delivery is uncertain. No matching QuickBooks reference was found; check QuickBooks before a new attempt.',claim_token:null,claim_until:null}).eq('id',job.id);
  throw new Error('Previous delivery is uncertain. Check QuickBooks; Mako will not send another copy.');
 }
 const claim=randomUUID(),claimed=await db.rpc('claim_qb_sync',{job_id:job.id,claim});if(claimed.error||!claimed.data)throw new Error('Another sync already claimed this record.');
 let remoteId:string|null=null;
 try{
  if(beforeWrite)await beforeWrite();
  const result=await qbWrite<Record<string,Remote>>(credential,kind.toLowerCase(),job.payload,job.request_id),remote=result[kind];remoteId=remote?.Id||null;verifyRemote(kind,remote,job.payload);
  const saved=await db.from('qb_sync_jobs').update({status:'Synced',remote_id:remoteId,error:'',claim_token:null,claim_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('claim_token',claim).select('id');if(saved.error||saved.data?.length!==1)throw new Error('QuickBooks accepted the record, but Mako could not save the confirmation.');return remoteId!;
 }catch(error){
  const definite=error instanceof QbWriteError&&[400,401,403,404,422,429].includes(error.status);
  await db.from('qb_sync_jobs').update({status:definite?'Failed':'Review',remote_id:remoteId,error:error instanceof Error?error.message:'Delivery outcome is uncertain. Review QuickBooks.',claim_token:null,claim_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('claim_token',claim);
  throw error;
 }
}
export async function syncMakoInvoice(wid:string,uid:string,invoiceId:string){
 const context=await accountingContext(wid,uid),{db,credential,setting}=context;
 const {data,error}=await db.from('business_documents').select('*').eq('workspace_id',wid).eq('id',invoiceId).eq('kind','Invoice').maybeSingle();if(error||!data)throw new Error('Invoice not available in this workspace.');const invoice=data as SyncInvoice,issue=invoiceSyncIssue(invoice);if(issue)throw new Error(issue);
 // Revalidate saved mappings on each run. No accounting objects are created to repair mappings.
 const [item,account]=await Promise.all([qbRead<{Item:{Active?:boolean;Type:string}}>(credential,`item/${setting.service_item_id}`),qbRead<{Account:{Active?:boolean;AccountType:string;AccountSubType?:string}}>(credential,`account/${setting.deposit_account_id}`)]);
 if(item.Item.Active===false||!['Service','NonInventory'].includes(item.Item.Type)||account.Account.Active===false||!(account.Account.AccountType==='Bank'||account.Account.AccountSubType==='UndepositedFunds'))throw new Error('Review the active service item and deposit account mappings.');
 const customerSource=invoice.customer_id||invoice.id,display=`${invoice.customer.name.slice(0,65)} [${accountingMarker('Customer',wid,customerSource)}]`;
 const mapped=await db.from('qb_sync_jobs').select('status,remote_id').eq('workspace_id',wid).eq('realm_id',credential.realmId).eq('environment',credential.environment).eq('kind','Customer').eq('source_id',customerSource).maybeSingle();if(mapped.error)throw new Error('Could not check the customer mapping.');
 if(!mapped.data?.remote_id&&!setting.create_customers)throw new Error('Link this Mako customer to a QuickBooks customer, or enable creation of dedicated Mako customers.');
 const customerId=mapped.data?.status==='Synced'&&mapped.data.remote_id?mapped.data.remote_id:await syncRecord(context,'Customer',customerSource,{DisplayName:display,CompanyName:(invoice.customer.company||'').slice(0,100)});
 const remoteInvoice=await syncRecord(context,'Invoice',invoice.id,invoiceSyncPayload(invoice,customerId,setting.service_item_id,wid));
 const payments=await db.from('invoice_payments').select('*',{count:'exact'}).eq('workspace_id',wid).eq('invoice_id',invoice.id).order('created_at').order('id').limit(100);if(payments.error||(payments.count||0)>100)throw new Error('Payment history could not be loaded completely. Review this invoice manually.');
 let syncedPayments=0;
 for(const payment of payments.data||[]){
  await syncRecord(context,'Payment',payment.id,paymentSyncPayload(payment,remoteInvoice,customerId,setting.deposit_account_id,wid),async()=>{
   const current=await qbRead<{Invoice:Remote}>(credential,`invoice/${remoteInvoice}`);
   const ids=(payments.data||[]).map(p=>p.id);const jobs=await db.from('qb_sync_jobs').select('payload').eq('workspace_id',wid).eq('realm_id',credential.realmId).eq('environment',credential.environment).eq('kind','Payment').eq('status','Synced').in('source_id',ids);
   if(jobs.error)throw new Error('Could not verify payment history.');const known=(jobs.data||[]).reduce((sum,j)=>sum+Math.round(Number(j.payload.TotalAmt)*100),0);
   if(current.Invoice.CustomerRef?.value!==customerId||Math.round(Number(current.Invoice.TotalAmt)*100)!==invoice.total_cents||Math.round(Number(current.Invoice.Balance)*100)!==invoice.total_cents-known||payment.amount_cents>invoice.total_cents-known)throw new Error('QuickBooks already has different payments or totals. Reconcile this invoice before sending payments.');
  });syncedPayments++;
 }
 return {invoice:invoice.id,remoteInvoice,payments:syncedPayments};
}
export async function mapAccountingCustomer(wid:string,uid:string,invoiceId:string,remoteId:string){
 if(!/^\d{1,30}$/.test(remoteId))throw new Error('Choose a valid QuickBooks customer.');
 const {db,credential}=await accountingContext(wid,uid),doc=await db.from('business_documents').select('id,customer_id').eq('workspace_id',wid).eq('id',invoiceId).eq('kind','Invoice').maybeSingle();if(!doc.data)throw new Error('Invoice unavailable.');
 const remote=await qbRead<{Customer:{Id:string;Active?:boolean}}>(credential,`customer/${remoteId}`);if(remote.Customer?.Id!==remoteId||remote.Customer.Active===false)throw new Error('Choose an active QuickBooks customer.');
 const source=doc.data.customer_id||doc.data.id,payload={linkedCustomer:remoteId},scope={workspace_id:wid,realm_id:credential.realmId,environment:credential.environment,kind:'Customer',source_id:source};
 const saved=await db.from('qb_sync_jobs').upsert({...scope,payload,source_hash:accountingHash(payload),status:'Synced',remote_id:remoteId},{onConflict:'workspace_id,realm_id,environment,kind,source_id',ignoreDuplicates:true});if(saved.error)throw new Error('Could not save customer mapping.');
 const check=await db.from('qb_sync_jobs').select('remote_id').match(scope).single();if(check.error||check.data.remote_id!==remoteId)throw new Error('This customer already has a different accounting mapping. Existing mappings cannot be silently replaced.');
}
