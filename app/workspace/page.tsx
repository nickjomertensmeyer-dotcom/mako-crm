import {ComingSoonConnections} from '@/components/coming-soon-connections';
import {Operations} from '@/components/operations';
import {operationModules} from '@/lib/operations';
import {BusinessSettings} from '@/components/business-settings';
import {AccountSettingsPage} from '@/components/account-settings';
import {accountSettings} from '@/lib/account';
import {BoardWorkspace} from '@/components/board-workspace';
import {loadBoards} from './board-actions';
import {Assistant} from '@/components/assistant';
import {Followups,Support,Plan} from '@/components/pro-tools';
import {workspace,identity} from '@/lib/workspace';
import {Dashboard,Overview} from '@/components/dashboard';
import {Records} from '@/components/records';
import {Documents,WorkBoard} from '@/components/business-tools';
import {redirect} from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string;message?:string;document?:string;new?:string;edit?:string;editWork?:string;record?:string}>}){
 const {client:authClient}=await identity();const {data:isAdmin}=await authClient.rpc('is_platform_admin');if(isAdmin)redirect('/owner');
 const {client,user,business,role}=await workspace();const params=await searchParams;const {view='overview',message}=params;
 const canContacts=business.modules.includes('customers')||business.modules.includes('leads');
 const [{data:contacts,error:contactError,count:contactCount},{data:tasks,error:taskError,count:taskCount},{data:summary}]=await Promise.all([
  canContacts?client.from('contacts').select('*',{count:'exact'}).eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(1000):Promise.resolve({data:[],error:null,count:0}),
  business.modules.includes('tasks')?client.from('tasks').select('*',{count:'exact'}).eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(1000):Promise.resolve({data:[],error:null,count:0}),
  view==='overview'||view==='invoices'?client.rpc('workspace_business_summary',{target:business.id}):Promise.resolve({data:null})]);
 const enabled=['overview','followups','assistant','support','plan','workflows','notifications','settings','business-settings','connections'].includes(view)||business.modules.includes(view);
 const emailReady=Boolean(process.env.RESEND_API_KEY&&process.env.FOLLOWUP_FROM_EMAIL&&process.env.SUPABASE_SECRET_KEY&&process.env.CRON_SECRET);
 const aiReady=Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL);
 const active=business.status==='active'&&['pro','custom'].includes(business.plan);
 let content=null;
 if(enabled&&['overview','customers','leads','tasks','workflows','notifications'].includes(view)){
  const loaded=await loadBoards(params.record);
  if(loaded.data)content=<BoardWorkspace initial={loaded.data} current={view} active={active}/>;
  else content=<><p className="notice" role="alert">{loaded.error}</p>{view==='overview'?<Overview business={business} contacts={contacts||[]} tasks={tasks||[]} summary={summary||undefined}/>:['tasks','leads','customers'].includes(view)?<Records view={view} contacts={contacts||[]} tasks={tasks||[]} active={active}/>:null}</>;
 }

 if(enabled&&['invoices','quotes'].includes(view)){
  const kind=view==='invoices'?'Invoice':'Quote';
  const {data:documents,error}=await client.from('business_documents').select('*').eq('workspace_id',business.id).eq('kind',kind).order('created_at',{ascending:false}).limit(200);
  // Fetch selected records independently of the recent-record list, with the same tenant restrictions.
  const {data:selected}=params.document?await client.from('business_documents').select('*').eq('workspace_id',business.id).eq('kind',kind).eq('id',params.document).maybeSingle():{data:null};
  const {data:payments}=selected&&kind==='Invoice'?await client.from('invoice_payments').select('*').eq('workspace_id',business.id).eq('invoice_id',selected.id).order('payment_date',{ascending:false}):{data:[]};
  content=<>{error&&<p className="notice">Business tools need a database update. Mako must apply migration 004 before documents can be saved.</p>}{params.document&&!selected&&<p className="notice">This document is unavailable or you do not have access to it.</p>}<Documents kind={kind} documents={documents||[]} contacts={contacts||[]} selected={selected||undefined} payments={payments||[]} create={params.new==='1'} edit={params.edit==='1'} enabled={active&&!error} summary={summary||undefined}/></>;
 }
 if(enabled&&(view==='jobs'||view==='schedule')){
  const today=new Date().toISOString().slice(0,10);const kinds=view==='jobs'?['Job']:['Job','Appointment'];
  const [future,past,editResult]=await Promise.all([
   client.from('work_items').select('*').eq('workspace_id',business.id).in('kind',kinds).gte('scheduled_date',today).order('scheduled_date').order('scheduled_time').limit(200),
   client.from('work_items').select('*').eq('workspace_id',business.id).in('kind',kinds).lt('scheduled_date',today).order('scheduled_date',{ascending:false}).limit(200),
   params.editWork?client.from('work_items').select('*').eq('workspace_id',business.id).in('kind',kinds).eq('id',params.editWork).maybeSingle():Promise.resolve({data:null})]);
  const error=future.error||past.error;const items=[...(future.data||[]),...(past.data||[])].slice(0,200);
  if(editResult.data&&!items.some(i=>i.id===editResult.data.id))items.push(editResult.data);
  content=<>{error&&<p className="notice">Business tools need a database update. Mako must apply migration 004 before work can be saved.</p>}<WorkBoard view={view} items={items} contacts={contacts||[]} enabled={active&&!error} editId={params.editWork}/></>;
 }
 if(view==='followups'){const {data,error}=await client.from('email_followups').select('*').eq('workspace_id',business.id).order('scheduled_at',{ascending:false}).limit(100);content=<>{error&&<p className="notice">Follow-up database setup is pending. Contact Mako to apply the Pro tools update.</p>}<Followups contacts={contacts||[]} items={data||[]} enabled={active&&emailReady&&!error} owner={role==='owner'}/></>;}
 if(view==='support'){const {data,error}=await client.from('support_requests').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100);content=<>{error&&<p className="notice">Support database setup is pending. You can still email makocrm@gmail.com.</p>}<Support tickets={data||[]} active={active&&!error}/></>;}
 if(view==='assistant')content=<Assistant enabled={active&&aiReady}/>;
 if(view==='plan'){const {data:backups}=await client.from('workspace_backups').select('id,day,status').eq('workspace_id',business.id).order('day',{ascending:false}).limit(15);content=<Plan plan={business.plan} owner={role==='owner'} email={emailReady} ai={aiReady} backups={backups||[]} backupEnabled={process.env.BACKUPS_ENABLED==='true'&&Boolean(process.env.SUPABASE_SECRET_KEY&&process.env.CRON_SECRET)}/>;}
 if((operationModules as readonly string[]).includes(view)&&enabled){const [records,moves,bookings,work,totals,visits]=await Promise.all([client.from('operation_records').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(1000),client.from('stock_movements').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(200),client.from('booking_requests').select('id,slot_id,name,email,cancelled').eq('workspace_id',business.id).limit(1000),client.from('work_items').select('id,title').eq('workspace_id',business.id).limit(1000),view==='inventory'?client.rpc('inventory_totals',{target:business.id}):Promise.resolve({data:{}}),view==='recurring'?client.from('plan_visits').select('plan_id,visit_date,work_id').order('visit_date',{ascending:false}).limit(200):Promise.resolve({data:[]})]);content=<><Operations view={view} initial={records.data||[]} totals={totals.data||{}} visits={visits.data||[]} movements={moves.data||[]} bookings={bookings.data||[]} work={work.data||[]} contacts={contacts||[]} owner={role==='owner'} workspaceId={business.id} enabled={active&&!records.error}/><p className="small-copy muted">Showing up to 1,000 records and the latest 200 stock movements. Stock balances include the complete ledger. Export includes all records.</p></>;}
 if(view==='business-settings')content=<BusinessSettings business={business} owner={role==='owner'}/>;
 if(view==='connections')content=<ComingSoonConnections/>;
 if(view==='settings')content=<AccountSettingsPage owner={role==='owner'}/>;
 return <Dashboard business={business} current={view} assistantEnabled={active&&aiReady} account={accountSettings(user.user_metadata,user.email)}>{message&&<p className="notice" role="status">{message}</p>}{(contactError||taskError)&&<p className="notice">Some records could not be loaded. Refresh or contact Mako.</p>}{content||(!enabled?<section className="panel"><h1>This tool isn’t enabled.</h1><a href="/onboarding">Update workspace settings</a></section>:view==='overview'?<Overview business={business} contacts={contacts||[]} tasks={tasks||[]} summary={summary||undefined}/>:['customers','leads','tasks'].includes(view)?<><Records view={view} contacts={contacts||[]} tasks={tasks||[]} active={active}/>{(contactCount||0)>1000||(taskCount||0)>1000?<p className="small-copy muted">Showing the latest 1,000 records. Your full records are available in the workspace export.</p>:null}</>:<section className="panel"><p className="eyebrow">ON YOUR WORKSPACE ROADMAP</p><h1 className="capitalize">{view}</h1><p className="muted">This tool is selected for your business. It will be available in a future release.</p><a href="/workspace">Back to overview</a></section>)}</Dashboard>;
}
