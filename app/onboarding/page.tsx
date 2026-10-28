import { identity } from '@/lib/workspace';
import { OnboardingForm } from '@/components/onboarding-form';
import { Brand } from '@/components/brand';
import { saveWorkspace } from './actions';
export default async function Page({searchParams}:{searchParams:Promise<{message?:string}>}){
  const {client}=await identity(); const {message}=await searchParams;
  const {data,error}=await client.from('memberships').select('role,workspaces(name,industry,modules)').limit(1).maybeSingle();
  const initial=data?.workspaces ? (Array.isArray(data.workspaces)?data.workspaces[0]:data.workspaces):undefined;
  return <main id="main" className="onboarding"><Brand/><div className="onboarding-card"><p className="eyebrow">A WORKSPACE THAT WORKS LIKE YOU</p><h1>Make Mako yours.</h1><p className="muted">Start with your business. Keep the tools you need.</p>{message&&<p className="notice" role="status">{message}</p>}{error?<p className="notice">Database setup is pending. <a href="/setup-required">View setup status</a></p>:data?.role==='member'?<p>Ask your workspace owner to change these settings.</p>:<OnboardingForm action={saveWorkspace} initial={initial}/>}<p className="secure-note">Choosing tools does not activate a subscription. Mako will confirm your plan and access.</p></div></main>;
}
