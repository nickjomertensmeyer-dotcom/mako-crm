import {supabase} from '@/lib/supabase/server';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 const client=await supabase();const {data:{user}}=await client.auth.getUser();
 if(!user)return new Response(null,{status:401});
 const {data:membership}=await client.from('memberships').select('workspace_id').eq('user_id',user.id).order('created_at').limit(1).maybeSingle();
 if(!membership)return new Response(null,{status:403});
 const {error}=await client.rpc('record_pilot_visit',{target:membership.workspace_id});
 return new Response(null,{status:error?503:204});
}
