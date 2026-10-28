import {identity} from '@/lib/workspace';
import {Brand} from '@/components/brand';
import {logout} from '../auth/actions';
export default async function Page(){await identity();return <main id="main" className="onboarding"><Brand/><section className="onboarding-card"><p className="eyebrow">ONE MORE CONNECTION</p><h1>Workspace setup is pending.</h1><p>The app can connect to your account, but the workspace database hasn’t been configured or is unavailable. Ask the Mako administrator to apply the database migration and check permissions.</p><a className="text-link" href="/workspace">Try again</a><form action={logout}><button className="secondary">Sign out</button></form></section></main>;}
