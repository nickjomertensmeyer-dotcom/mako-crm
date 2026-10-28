import {Assistant} from '@/components/assistant';
import {Followups,Support,Plan} from '@/components/pro-tools';
import { workspace } from '@/lib/workspace';
import { Dashboard, Overview } from '@/components/dashboard';
import { Records } from '@/components/records';
import { identity } from '@/lib/workspace';
import { redirect } from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string;message?:string}>}){
 const {client:authClient}=await identity();const {data:isAdmin}=await authClient.rpc('is_platform_admin');if(isAdmin)redirect('/owner');
 const {client,business,role}=await workspace();const {view='overview',message}=await searchParams;
 const canContacts=business.modules.includes('customers')||business.modules.includes('leads');
 const [{data:contacts,error:contactError},{data:tasks,error:taskError}]=await Promise.all([
  canContacts?client.from('contacts').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  business.modules.includes('tasks')?client.from('tasks').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null})]);
 const enabled=['overview','followups','assistant','support','plan'].includes(view)||business.modules.includes(view);
 const emailReady=Boolean(process.env.RESEND_API_KEY&&process.env.FOLLOWUP_FROM_EMAIL&&process.env.SUPABASE_SECRET_KEY&&process.env.CRON_SECRET);
 const aiReady=Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL);
 const active=business.status==='active'&&['pro','custom'].includes(business.plan);
 let proContent=null;
 if(view==='followups'){const {data,error}=await client.from('email_followups').select('*').eq('workspace_id',business.id).order('scheduled_at',{ascending:false}).limit(100);proContent=<>{error&&<p className="notice">Follow-up database setup is pending. Contact Mako to apply the Pro tools update.</p>}<Followups contacts={contacts||[]} items={data||[]} enabled={active&&emailReady&&!error} owner={role==='owner'}/></>;}
 if(view==='support'){const {data,error}=await client.from('support_requests').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100);proContent=<>{error&&<p className="notice">Support database setup is pending. You can still email makocrm@gmail.com.</p>}<Support tickets={data||[]} active={active&&!error}/></>;}
 if(view==='assistant')proContent=<Assistant enabled={active&&aiReady}/>;
 if(view==='plan'){const {data:backups}=await client.from('workspace_backups').select('id,day,status').eq('workspace_id',business.id).order('day',{ascending:false}).limit(15);proContent=<Plan plan={business.plan} owner={role==='owner'} email={emailReady} ai={aiReady} backups={backups||[]} backupEnabled={process.env.BACKUPS_ENABLED==='true'&&Boolean(process.env.SUPABASE_SECRET_KEY&&process.env.CRON_SECRET)}/>;}
 
 return <Dashboard business={business} current={view}>{message&&<p className="notice" role="status">{message}</p>}{(contactError||taskError)&&<p className="notice">Some records could not be loaded. Refresh or contact Mako.</p>}{proContent||(!enabled?<section className="panel"><h1>This tool isn’t enabled.</h1><a href="/onboarding">Update workspace settings</a></section>:view==='overview'?<Overview business={business} contacts={contacts||[]} tasks={tasks||[]}/>:['customers','leads','tasks'].includes(view)?<Records view={view} contacts={contacts||[]} tasks={tasks||[]} active={business.status==='active'}/>:<section className="panel"><p className="eyebrow">ON YOUR WORKSPACE ROADMAP</p><h1 className="capitalize">{view}</h1><p className="muted">This tool is selected for your business. It will be available in a future release.</p><a href="/workspace">Back to overview</a></section>)}</Dashboard>;
}
