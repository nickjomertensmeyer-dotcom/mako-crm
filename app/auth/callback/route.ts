import {PILOT_COOKIE} from '@/lib/pilot';
import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');
  const target = next === '/reset-password' ? next : request.cookies.has(PILOT_COOKIE)?'/pilot':'/workspace';
  if (code) { const client = await supabase(); const { error } = await client.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(target, request.url)); }
  return NextResponse.redirect(new URL(next==='/reset-password'?'/forgot-password?message=This+older+link+could+not+be+verified.+Request+a+new+reset+email+and+open+only+the+newest+message.':'/signup?sent=1&message=This+link+could+not+be+verified.+It+may+have+been+used+already+or+opened+in+a+different+browser.+Request+a+new+confirmation+email.', request.url));
}
