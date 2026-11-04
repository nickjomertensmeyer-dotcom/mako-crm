import {billingClient} from '@/lib/billing';
// Rendered only after the owner page's platform-admin check succeeds.
export async function OwnerFinUsage(){
 const db=billingClient();
 const [{data:config,error},{data:requests}]=await Promise.all([db.from('fin_config').select('enabled,total_budget_cents,monthly_budget_cents').eq('id',true).maybeSingle(),db.from('fin_requests').select('credits,cost_cents,state').limit(10000)]);
 if(error||!config)return null;
 const spent=(requests||[]).reduce((n,r)=>n+r.cost_cents,0),used=(requests||[]).filter(r=>r.state==='complete').reduce((n,r)=>n+r.credits,0);
 return <details className="panel"><summary>Fin AI usage · {config.enabled?'Enabled':'Paused'}</summary><p>{used} credits used · ${(spent/100).toFixed(2)} conservatively recorded or reserved for provider usage.</p><p>Initial total test cap: ${(config.total_budget_cents/100).toFixed(2)}. Monthly cap: ${(config.monthly_budget_cents/100).toFixed(2)}. Failed provider requests may still incur costs; those reservations remain in the spending total. This display covers up to 10,000 requests.</p></details>;
}
