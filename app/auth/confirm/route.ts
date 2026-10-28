import {NextResponse,type NextRequest} from 'next/server';
import {supabase} from '@/lib/supabase/server';
export async function GET(request:NextRequest){
 const hash=request.nextUrl.searchParams.get('token_hash');const type=request.nextUrl.searchParams.get('type');
 if(hash&&(type==='invite'||type==='recovery'||type==='email')){
  const client=await supabase();const {error}=await client.auth.verifyOtp({token_hash:hash,type});
  if(!error)return NextResponse.redirect(new URL(type==='recovery'||type==='invite'?'/reset-password':'/workspace',request.url));
 }
 return NextResponse.redirect(new URL('/login?message=This+link+has+expired.+Contact+Mako+for+a+new+invitation.',request.url));
}
