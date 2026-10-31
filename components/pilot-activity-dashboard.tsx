'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {setPilotExcluded} from '@/app/owner/pilot-activity-actions';
import {pilotDaysLeft,pilotNeedsHelp,pilotStage,type PilotActivityRow} from '@/lib/pilot-activity';
const date=(s:string|null)=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}):'Not observed';
export function PilotActivityDashboard({rows,startedAt}:{rows:PilotActivityRow[];startedAt:string}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[tests,setTests]=useState(false),[error,setError]=useState('');
 const [pending,startTransition]=useTransition();const router=useRouter();
 const included=rows.filter(r=>!r.excluded),now=Date.now();
 const visible=rows.filter(r=>(tests||!r.excluded)&&`${r.business||''} ${r.email}`.toLowerCase().includes(query.toLowerCase())&&(filter==='All'||(filter==='Needs help'?pilotNeedsHelp(r,startedAt,now):pilotStage(r)===filter)));
 const counts=[['Invited',included.length],['Verified signup',included.filter(r=>r.verified).length],['Pilot accepted',included.filter(r=>r.accepted_at).length],['Activated',included.filter(r=>r.activated).length],['Subscribed',included.filter(r=>r.subscribed).length]] as const;
 return <section className="panel pilot-activity" id="pilot-activity" aria-labelledby="pilot-activity-title">
  <div className="page-heading"><div><p className="eyebrow">PILOT ACTIVITY</p><h2 id="pilot-activity-title">See who’s getting started.</h2><p className="muted">Real workspace actions, with test businesses excluded.</p></div><button className="secondary" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}>{pending?'Updating…':'Refresh activity'}</button></div>
  <div className="pilot-metrics">{counts.map(([label,n])=><div key={label}><span>{label}</span><strong>{n}</strong></div>)}</div>
  <details className="pilot-definitions"><summary>How these numbers work</summary><p>Activated means a business added or imported a contact, created work linked to a contact, and was active on two different UTC dates within seven days of accepting its pilot. Progress means completing work, changing a customer/lead stage, or recording a payment.</p><p>Invited counts created invitations, not delivered emails. Verified signup includes matching verified accounts; it does not prove the invitation caused signup. Subscribed means an active live Stripe subscription, not sandbox billing or collected revenue. Counts are separate milestones, not a strict funnel.</p><p>Tracking began {date(startedAt)} (Central). Earlier visits and deleted records cannot be reconstructed. Older pilots may show incomplete milestones. Activity is measured at workspace level and can include multiple team members. Refresh to see new activity.</p></details>
  <div className="pilot-controls"><label>Find a business<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Business or invited email"/></label><label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Not started','Setting up','Activated','Subscribed','Needs help'].map(s=><option key={s}>{s}</option>)}</select></label><label className="pilot-test-toggle"><input type="checkbox" checked={tests} onChange={e=>setTests(e.target.checked)}/>Show excluded tests ({rows.length-included.length})</label></div>
  {error&&<p role="alert" className="notice">{error}</p>}
  <div className="table-scroll"><table><caption>{visible.length} {visible.length===1?'business':'businesses'} · Times shown in Central</caption><thead><tr><th>Business</th><th>Status</th><th>Pilot</th><th>Milestones</th><th>Last activity</th><th>Tracking</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}>
   <td><strong>{r.business||'Workspace not created'}</strong><br/>{r.email}</td>
   <td><span className="pilot-stage">{pilotStage(r)}</span>{pilotNeedsHelp(r,startedAt,now)&&<p className="pilot-help">Needs help · 3 days without a recorded action</p>}{r.excluded&&<p>Excluded test</p>}</td>
   <td>{r.revoked_at?'Revoked':r.subscribed?'Subscribed':r.ends_at?`${pilotDaysLeft(r.ends_at,now)} days left`:Date.parse(r.expires_at)<=now?'Invitation expired':'Not accepted'}{r.ends_at&&<p className="small-copy">Ends {date(r.ends_at)}</p>}</td>
   <td><ul className="pilot-milestones">{[['Contact',r.contact_at],['Work created',r.work_at],['Work progressed',r.progress_at],['Returned another day',r.returned]].map(([label,value])=><li key={String(label)}><span aria-label={value?'Completed':'Not observed'}>{value?'✓':'—'}</span> {label}</li>)}</ul></td>
   <td>{date(r.last_active)}<p className="small-copy muted">Last record action: {date(r.last_meaningful)}</p></td>
   <td><button className="secondary compact" disabled={pending} onClick={()=>startTransition(async()=>{const result=await setPilotExcluded(r.id,!r.excluded);setError(result.error);if(!result.error)router.refresh();})}>{r.excluded?'Include in metrics':'Exclude as test'}</button></td>
  </tr>)}</tbody></table></div>{!visible.length&&<p className="muted">No pilots match these filters.</p>}
 </section>;
}
