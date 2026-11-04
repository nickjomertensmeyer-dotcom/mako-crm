'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {createHash} from 'node:crypto';
import {supabase} from '@/lib/supabase/server';
import {TEAM_COOKIE,validTeamCode} from '@/lib/team';
export async function beginTeamInvite(form:FormData){const code=String(form.get('code')||'');if(!validTeamCode(code))redirect('/join?message=Open+your+private+invitation+link.');(await cookies()).set(TEAM_COOKIE,code,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:86400});redirect(form.get('destination')==='signup'?'/signup':'/login');}
export async function acceptTeamInvite(form:FormData){const code=String(form.get('code')||'');if(!validTeamCode(code))redirect('/join?message=Invitation+unavailable.');const client=await supabase();const {error}=await client.rpc('accept_team_invitation',{secret_hash:createHash('sha256').update(code).digest('hex')});if(error)redirect('/join?code='+encodeURIComponent(code)+'&message='+encodeURIComponent(error.message.includes('already belongs')?'This account already belongs to another workspace. Use the invited account.':'Could not join. Verify the invited email, check that the link has not expired, and ask the owner to check available seats.'));(await cookies()).delete(TEAM_COOKIE);redirect('/workspace?view=team&message=You+have+joined+the+team.');}
