import {cookies} from 'next/headers';
import {PILOT_COOKIE} from '@/lib/pilot';
import { identity } from '@/lib/workspace';
import { OnboardingForm } from '@/components/onboarding-form';
import { Brand } from '@/components/brand';
import { saveWorkspace } from './actions';
export default async function Page({searchParams}:{searchParams:Promise<{message?:string}>}){
  const {client}=await identity(); const {message}=await searchParams;
  const {data,error}=await client.from('memberships').select('role,workspaces(name,industry,modules)').limit(1).maybeSingle();
  const initial=data?.workspaces ? (Array.isArray(data.workspaces)?data.workspaces[0]:data.workspaces):undefined;
  return <main id="main" className="onboarding"><Brand/><div className="onboarding-card"><p className="eyebrow">A WORKSPACE THAT WORKS LIKE YOU</p><h1>Set up your lawn care business.</h1><p className="muted">Start with a ready-to-go property workflow. You can adjust your tools later.</p>{message&&<p className="notice" role="status">{message}</p>}{error?<p className="notice">Database setup is pending. <a href="/setup-required">View setup status</a></p>:data?.role==='member'?<p>Ask your workspace owner to change these settings.</p>:<OnboardingForm action={saveWorkspace} initial={initial} pilot={Boolean((await cookies()).get(PILOT_COOKIE))}/>}<p className="secure-note">Choose Starter ($49/month), Pro ($100/month), or Team ($179/month), then confirm your user count in secure Stripe checkout. New subscriptions include 7 days free with payment details required. Your selected monthly total plus applicable tax applies unless you cancel before the trial ends. Existing workspace settings and invited pilot access are unchanged.</p></div></main>;
}
