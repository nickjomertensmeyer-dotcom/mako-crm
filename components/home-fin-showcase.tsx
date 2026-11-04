import {Check} from 'lucide-react';
import {SharkyIcon} from './sharky-icon';
const abilities=[
 'Look up your schedule, overdue tasks and unpaid invoices',
 'Draft quotes, follow-up texts and customer emails for you to review',
 'Add customers, jobs and tasks, or reschedule a visit, in one sentence',
 'Plan your day or week from your real workload',
];
export function HomeFinShowcase(){
 return <section id="fin" className="home-section home-fin" aria-labelledby="fin-heading">
  <div className="fin-copy-block">
   <p className="eyebrow">MEET FIN</p>
   <h2 id="fin-heading">A sidekick that<br/>does the work.</h2>
   <p>Ask a question, plan your week, or tell Fin what to change. Every change shows a preview first and nothing saves until you confirm it.</p>
   <ul className="fin-ability-list">{abilities.map(a=><li key={a}><Check size={16}/>{a}</li>)}</ul>
   <p className="fin-fine-print">Fin never sends messages or takes payments by itself. Each paid plan includes shared monthly Fin credits.</p>
  </div>
  <figure className="fin-demo" aria-label="Example conversation with Fin">
   <div className="fin-demo-header"><SharkyIcon size={30}/><div><strong>Fin</strong><span>Your business assistant</span></div></div>
   <div className="fin-demo-body">
    <p className="fin-bubble fin-user">Move Thursday’s Oak Street trim to Friday at 9.</p>
    <p className="fin-bubble fin-bot">Done preparing that. Review the change below and confirm when it looks right.</p>
    <div className="fin-demo-preview"><strong>Review before saving · 1 credit</strong><p>Reschedule: Oak Street trim</p><p><b>From:</b> Thursday 9:00 AM</p><p><b>To:</b> Friday 9:00 AM</p><div className="fin-demo-buttons"><span>Confirm &amp; save</span><span>Cancel</span></div></div>
   </div>
   <figcaption>Example conversation with fictional data</figcaption>
  </figure>
 </section>;
}
