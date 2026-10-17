import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPendingAdmin, getSession } from '@/lib/auth';
import { authClient } from '@/lib/supabase-server';
import { AuthShell } from '@/components/auth-shell';
import { MfaChallenge, MfaEnroll } from './mfa-forms';

export const metadata: Metadata = { title: 'Two-factor' };

export default async function MfaPage() {
  const admin = await getPendingAdmin();
  if (!admin) redirect('/login');
  const s = await getSession();
  if (s?.aal === 'aal2') redirect('/');
  const factors = await (await authClient()).auth.mfa.listFactors();
  const enrolled = !!factors.data?.totp.some((f) => f.status === 'verified');

  return (
    <AuthShell
      title={enrolled ? 'Two-factor check' : 'Set up two-factor'}
      subtitle={enrolled ? 'Enter the 6-digit code from your authenticator app.' : 'Every admin must use an authenticator app. This takes a minute.'}
    >
      {enrolled ? <MfaChallenge /> : <MfaEnroll />}
    </AuthShell>
  );
}
