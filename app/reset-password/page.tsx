import { AuthShell } from '@/components/auth-shell';
import { resetPassword } from '../auth/actions';
import { identity } from '@/lib/workspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string }> }) { await identity(); const { message } = await searchParams; return <AuthShell><div className="auth-form"><h2>A fresh start.</h2>{message && <p className="notice" role="status">{message}</p>}<form action={resetPassword}><label>New password<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label><label>Confirm password<input name="confirm" type="password" minLength={12} autoComplete="new-password" required /></label><button className="primary">Update password</button></form></div></AuthShell>; }
