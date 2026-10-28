import { workspace } from '@/lib/workspace';
import { Dashboard, Overview } from '@/components/dashboard';
import { Records } from '@/components/records';
import { identity } from '@/lib/workspace';
import { redirect } from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string;message?:string}>}){
 const {client:authClient}=await identity();const {data:isAdmin}=await authClient.rpc('is_platform_admin');if(isAdmin)redirect('/owner');
 const {client,business}=await workspace();const {view='overview',message}=await searchParams;
 const canContacts=business.modules.includes('customers')||business.modules.includes('leads');
 const [{data:contacts,error:contactError},{data:tasks,error:taskError}]=await Promise.all([
  canContacts?client.from('contacts').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  business.modules.includes('tasks')?client.from('tasks').select('*').eq('workspace_id',business.id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null})]);
 const enabled=view==='overview'||business.modules.includes(view);
 return <Dashboard business={business} current={view}>{message&&<p className="notice" role="status">{message}</p>}{(contactError||taskError)&&<p className="notice">Some records could not be loaded. Refresh or contact Mako.</p>}{!enabled?<section className="panel"><h1>This tool isn’t enabled.</h1><a href="/onboarding">Update workspace settings</a></section>:view==='overview'?<Overview business={business} contacts={contacts||[]} tasks={tasks||[]}/>:['customers','leads','tasks'].includes(view)?<Records view={view} contacts={contacts||[]} tasks={tasks||[]} active={business.status==='active'}/>:<section className="panel"><p className="eyebrow">ON YOUR WORKSPACE ROADMAP</p><h1 className="capitalize">{view}</h1><p className="muted">This tool is selected for your business. It will be available in a future release.</p><a href="/workspace">Back to overview</a></section>}</Dashboard>;
}
