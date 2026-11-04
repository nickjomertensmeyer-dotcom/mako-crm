import {GoogleAuthButton} from '@/components/google-auth-button';
import {cookies} from 'next/headers';
import {ResendConfirmation} from '@/components/resend-confirmation';
import {AuthShell} from '@/components/auth-shell';
import {SignupForm} from '@/components/signup-form';
import {planById} from '@/lib/plans';
import {TEAM_COOKIE} from '@/lib/team';
export default async function Page({searchParams}:{searchParams:Promise<{message?:string;sent?:string;plan?:string}>}){
 const {message,sent,plan:chosen}=await searchParams,store=await cookies(),joining=store.has(TEAM_COOKIE),plan=planById(chosen)||planById('pro')!;
 const retryAt=Number(store.get('mako-confirmation-retry')?.value||0);
 return <AuthShell><div className="auth-form"><p className="eyebrow">{joining?'JOIN YOUR LAWN CARE TEAM':'YOUR LAWN CARE BUSINESS, IN FOCUS'}</p><h2>{joining?'Your team.\nOne workspace.':'Your first seven days.\nOn us.'}</h2><p className="muted">{joining?'Create an account using the email your owner invited. You won’t start a separate subscription.':`Start with Mako ${plan.name}: $${plan.monthlyCents/100}/month with ${plan.includedUsers} ${plan.includedUsers===1?'user':'users'} included. Create your account, then confirm your plan in secure checkout.`}</p>
 {message&&<p className="notice" role="status">{message}</p>}{sent?<section className="panel"><h3>Check your inbox.</h3><p>Open the newest confirmation email to continue. Check your spam folder too.</p><ResendConfirmation retryAt={Number.isFinite(retryAt)?retryAt:0}/></section>:<>
 {!joining&&<section className="signup-disclosure"><h3>Seven days free. Payment details required.</h3><p>Your selected plan and user total is charged monthly after seven days unless you cancel before the trial ends. Additional users cost $15/month above the included count. Applicable tax is additional. No onboarding fee.</p><p>Account creation alone does not start a trial or charge. You can review Starter, Pro, and Team before confirming checkout. One introductory trial per workspace; returning subscriptions start billing at checkout.</p><p><a href="/terms#billing">Pricing and trial terms</a> · <a href="/privacy">Privacy</a></p></section>}
 <GoogleAuthButton intent="signup" plan={plan.id}/><SignupForm plan={plan.id} joining={joining}/></>}
 <a className="text-link" href="/login">Already have an account? Sign in →</a></div></AuthShell>;
}
