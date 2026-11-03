import {LockKeyhole} from 'lucide-react';

const features:Record<string,{title:string;description:string;action:string;example:string}[]>={
  customers:[{title:'Tags & customer portal',description:'Organize contacts with tags and share finalized quotes and invoices through a private customer link.',action:'Create portal link',example:'Sample tags: repeat customer, priority'}],
  leads:[{title:'Contact tags',description:'Label leads and find related contacts by tag.',action:'Save contact tags',example:'Sample tags: estimate requested, spring project'}],
  invoices:[{title:'Recurring invoice drafts',description:'Create draft invoices weekly or monthly, then review and finalize each one. This does not automatically charge a card.',action:'Save recurring schedule',example:'Sample schedule: Monthly · review before sharing'}, {title:'Invoice reminders',description:'Send eligible invoice reminders to customers. Delivery requires your active plan and reminder setup.',action:'Schedule invoice reminder',example:'Sample reminder: invoice balance and payment due date'}, {title:'Payments & deposits',description:'Create invoice payment links through your connected Stripe account, including a requested deposit.',action:'Create payment link',example:'Sample deposit: $50.00 · no real payment link'}],
  quotes:[{title:'Customer quote approval',description:'Share a private quote approval link and track the customer’s response.',action:'Create approval link',example:'Sample quote: QUO-000002 · awaiting review'}],
  jobs:[{title:'Job checklists & photos',description:'Keep checklist items and before/after photos with a job. Real uploads require an active workspace.',action:'Upload job photo',example:'Sample checklist: confirm scope → complete work → final check'}],
  followups:[{title:'Email templates & review requests',description:'Save reusable messages and prepare requests for honest customer reviews. Sending requires a connected provider and an active plan.',action:'Save email template',example:'Sample template: “How was your experience?”'}],
};

// Read-only examples: no server actions, provider calls, uploads, or real links.
export function DemoProFeatures({view}:{view:string}){
  const items=features[view];
  if(!items)return null;
  return <details className="panel demo-pro-features"><summary><span>More with Pro</span><span className="badge"><LockKeyhole size={12} aria-hidden="true"/>Locked in demo</span></summary>
    <p className="small-copy muted">Preview current Pro tools below. Create your account and activate Pro to use them with your own business data.</p>
    <div className="demo-pro-grid">{items.map(item=><article key={item.title}><h3>{item.title}</h3><p>{item.description}</p><p className="demo-pro-example">{item.example}</p><button type="button" className="secondary compact" disabled><LockKeyhole size={14} aria-hidden="true"/>{item.action}</button></article>)}</div>
    <a className="primary compact" href="/signup">Create an account for Pro</a>
  </details>;
}
