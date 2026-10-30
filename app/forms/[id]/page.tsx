import {notFound} from 'next/navigation';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {formProof} from '@/lib/lead-form';
import {PublicLeadForm} from '@/components/public-lead-form';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();const db=calendarDatabase();
 const {data:form}=await db.from('website_lead_forms').select('id,title,workspace_id,enabled').eq('id',id).eq('enabled',true).maybeSingle();if(!form)notFound();
 const {data:business}=await db.from('workspaces').select('name,status,plan,modules,archived_at').eq('id',form.workspace_id).maybeSingle();if(!business||business.archived_at||business.status!=='active'||!['pro','custom'].includes(business.plan)||!business.modules.includes('leads'))notFound();
 return <main id="main" className="public-lead-page"><section className="panel"><p className="eyebrow">{business.name}</p><h1>{form.title}</h1><p className="muted">Send your enquiry to {business.name}.</p><PublicLeadForm id={id} proof={formProof(id,calendarConfig().key.toString('hex'))} business={business.name}/><a className="small-copy" href="/privacy">Privacy information</a></section></main>;
}
