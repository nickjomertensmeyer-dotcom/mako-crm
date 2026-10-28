import {supabase} from '@/lib/supabase/server';
export async function GET() {
  const client=await supabase();const {data:{user}}=await client.auth.getUser();
  if(!user)return new Response(null,{status:401});
  const path=user.user_metadata.mako_avatar;
  if(typeof path!=='string'||!path.startsWith(`${user.id}/`))return new Response(null,{status:404});
  const {data,error}=await client.storage.from('profile-photos').download(path);
  if(error||!data)return new Response(null,{status:404});
  return new Response(data,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
