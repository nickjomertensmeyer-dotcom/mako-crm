import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');
  const target = next === '/reset-password' ? next : '/workspace';
  if (code) { const client = await supabase(); const { error } = await client.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(target, request.url)); }
  return NextResponse.redirect(new URL('/login?message=This+link+has+expired.+Please+request+a+new+one.', request.url));
}
