import {supabase} from '@/lib/supabase/server';
export async function GET(request:Request){
  const client=await supabase();const {data:{user}}=await client.auth.getUser();
  if(!user)return new Response(null,{status:401});
  const id=new URL(request.url).searchParams.get('workspace');
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404});
  const {data:membership}=await client.from('memberships').select('workspace_id').eq('workspace_id',id).eq('user_id',user.id).maybeSingle();
  if(!membership)return new Response(null,{status:404});
  const {data:business}=await client.from('workspaces').select('logo_path').eq('id',id).maybeSingle();
  const path=business?.logo_path;
  if(typeof path!=='string'||!path.startsWith(`${id}/`))return new Response(null,{status:404});
  const {data,error}=await client.storage.from('business-logos').download(path);
  if(error||!data)return new Response(null,{status:404});
  return new Response(data,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
