import {Operations} from '@/components/operations';
import {operationModules} from '@/lib/operations';
import {demoOperations,demoMovements} from '@/lib/demo-operations';
import {BusinessSettings} from '@/components/business-settings';
import {AccountSettingsPage} from '@/components/account-settings';
import {BoardWorkspace} from '@/components/board-workspace';
import {demoBoards} from '@/lib/demo-boards';
import {Assistant} from '@/components/assistant';
import {Followups,Support,Plan} from '@/components/pro-tools';
import {Dashboard,Overview} from '@/components/dashboard';
import {Records} from '@/components/records';
import {Documents,WorkBoard} from '@/components/business-tools';
import {demoBusiness as business,demoContacts as contacts,demoTasks as tasks,demoDocuments,demoPayments,demoWork,demoSummary} from '@/lib/demo-business';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string;document?:string;new?:string;edit?:string;editWork?:string}>}){
 const p=await searchParams;const {view='overview'}=p;const selected=demoDocuments.find(d=>d.id===p.document);
 return <Dashboard business={business} current={view} demo>{(operationModules as readonly string[]).includes(view)?<Operations view={view} initial={demoOperations} movements={demoMovements} contacts={contacts} work={demoWork} demo/>:view==='business-settings'?<BusinessSettings business={business} demo/>:view==='settings'?<AccountSettingsPage/>:['overview','tasks','leads','customers','workflows','notifications'].includes(view)?<BoardWorkspace initial={demoBoards()} current={view} active demo/>:view==='assistant'?<Assistant enabled={false} demo/>:view==='followups'?<Followups contacts={contacts} items={[]} enabled={false} owner demo/>:view==='support'?<Support tickets={[{id:"demo-support-1",subject:"Example: choosing workspace tools",category:"Configuration change",status:"Open",created_at:"2026-10-29T12:00:00Z",details:"This is a fictional demo request. How do I choose the right tools for a service business? No request has been sent to Mako."}]} active={false} demo/>:view==='plan'?<Plan plan="pro" owner demo ai={false} email={false}/>:view==='overview'?<Overview business={business} contacts={contacts} tasks={tasks} summary={demoSummary} demo/>:['customers','leads','tasks'].includes(view)?<Records view={view} contacts={contacts} tasks={tasks} active={false} demo/>:view==='invoices'||view==='quotes'?<Documents kind={view==='invoices'?'Invoice':'Quote'} contacts={contacts} documents={demoDocuments.filter(d=>d.kind===(view==='invoices'?'Invoice':'Quote'))} selected={selected} payments={demoPayments.filter(i=>i.invoice_id===selected?.id)} create={p.new==='1'} edit={p.edit==='1'} enabled={false} summary={demoSummary} demo/>:view==='jobs'||view==='schedule'?<WorkBoard view={view} items={demoWork.filter(i=>view==='schedule'||i.kind==='Job')} contacts={contacts} enabled={false} editId={p.editWork} demo/>:<section className="panel"><h1>Tool not available</h1><a href="/preview">Back to overview</a></section>}</Dashboard>;
}
