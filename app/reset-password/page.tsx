import { AuthShell } from '@/components/auth-shell';
import { resetPassword } from '../auth/actions';
import { identity } from '@/lib/workspace';
import { ResetPasswordField } from '@/components/reset-password-field';
export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string }> }) { await identity(); const { message } = await searchParams; return <AuthShell><div className="auth-form"><h2>A fresh start.</h2>{message && <p className="notice" role="status">{message}</p>}<form action={resetPassword}><ResetPasswordField name="password" label="New password"/><ResetPasswordField name="confirm" label="Confirm password"/><button className="primary">Update password</button></form></div></AuthShell>; }
