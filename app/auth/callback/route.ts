import {googleAuthFailure,GOOGLE_AUTH_COOKIE} from '@/lib/google-auth';
import {PILOT_COOKIE} from '@/lib/pilot';
import {TEAM_COOKIE} from '@/lib/team';
import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');
  const googleIntent=request.cookies.get(GOOGLE_AUTH_COOKIE)?.value;
  const googleFlow=googleIntent==='signup'||googleIntent==='login';
  const finish=(destination:string)=>{const response=NextResponse.redirect(new URL(destination,request.url));if(googleFlow)response.cookies.set(GOOGLE_AUTH_COOKIE,'',{path:'/auth/callback',maxAge:0,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});return response;};
  const target = next === '/reset-password' ? next : request.cookies.has(TEAM_COOKIE)?'/join':request.cookies.has(PILOT_COOKIE)?'/pilot':'/workspace';
  if (code) {try{const client = await supabase(); const { error } = await client.auth.exchangeCodeForSession(code); if (!error) return finish(target);}catch{/* Recover expired or interrupted auth flows without exposing provider errors. */}}
  if(googleFlow)return finish(googleAuthFailure(googleIntent));
  return NextResponse.redirect(new URL(next==='/reset-password'?'/forgot-password?message=This+older+link+could+not+be+verified.+Request+a+new+reset+email+and+open+only+the+newest+message.':'/signup?sent=1&message=This+link+could+not+be+verified.+It+may+have+been+used+already+or+opened+in+a+different+browser.+Request+a+new+confirmation+email.', request.url));
}
