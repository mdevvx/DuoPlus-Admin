import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const REASONS: Record<string, string> = {
  idle: 'You were signed out after 3 hours of inactivity.',
  expired: 'Your 8-hour session ended. Please sign in again.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your admin email and password.">
      {reason && REASONS[reason] && <p className="mb-5 rounded-lg bg-info-soft px-3.5 py-2.5 text-info" role="status">{REASONS[reason]}</p>}
      <LoginForm />
    </AuthShell>
  );
}
