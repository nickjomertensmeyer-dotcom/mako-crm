import {pilotExpired} from './pilot';
import { redirect } from 'next/navigation';
import { supabase } from './supabase/server';
export async function identity() {
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { client, user: data.user };
}
export async function workspace() {
  const { client, user } = await identity();
  const { data, error } = await client.from('memberships').select('workspace_id, role, workspaces(*)').eq('user_id', user.id).order('created_at').limit(1).maybeSingle();
  if (error) redirect('/setup-required');
  if (!data) redirect('/onboarding');
  const business = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces;
  if (!business) redirect('/setup-required');
  return { client, user, business:pilotExpired(business.pilot_ends_at)?{...business,status:'suspended'}:business, role: data.role };
}
