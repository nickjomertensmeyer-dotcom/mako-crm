'use server';
import {cookies} from 'next/headers';
import {PILOT_COOKIE} from '@/lib/pilot';
import { redirect } from 'next/navigation';
import { identity } from '@/lib/workspace';
import { modules, industries } from '@/lib/presets';
export async function saveWorkspace(form: FormData) {
  const {client}=await identity();
  const name=String(form.get('name')||'').trim(); const industry=String(form.get('industry'));
  const selected=[...new Set(form.getAll('modules').map(String))].filter(m=>(modules as readonly string[]).includes(m));
  if(name.length<2 || name.length>100 || !(industries as readonly string[]).includes(industry) || !selected.length) redirect('/onboarding?message=Check+your+business+details+and+choose+at+least+one+tool.');
  const {data: membership}=await client.from('memberships').select('workspace_id').limit(1).maybeSingle();
  const {error}=membership ? await client.rpc('configure_workspace',{target:membership.workspace_id,business_name:name,business_industry:industry,selected_modules:selected}) : await client.rpc('create_workspace',{business_name:name,business_industry:industry,selected_modules:selected});
  if(error) redirect('/onboarding?message=Could+not+save.+Contact+Mako+if+this+continues.');
  redirect((await cookies()).get(PILOT_COOKIE)?'/pilot':'/workspace');
}
