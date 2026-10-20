import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { ABSOLUTE_MS, IDLE_MS, STEPUP_MS, LOCK_MS, MAX_FAILURES } from '@/lib/session-policy';
import { Card, KV, PageHeader, RoleTag } from '@/components/ui';
import { NicknameForm } from '@/components/nickname-form';
import { roleLabel } from '@/lib/roles';
import { currentTheme } from '@/lib/theme';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { admin } = await requirePage();
  const min = (ms: number) => `${ms / 60000} minutes`;
  return (
    <>
      <PageHeader title="Settings" description="Session policy is fixed in code; use the theme button in the top bar to change your theme." />
      <div className="grid max-w-3xl gap-4">
        <Card title="Profile">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded bg-accent-soft text-lg font-semibold text-accent">{(admin.displayName ?? admin.email).trim().charAt(0).toUpperCase()}</span>
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold">{admin.displayName ?? admin.email.split('@')[0]} <RoleTag role={admin.role} /></div>
              <div className="text-xs text-muted">{admin.email}</div>
            </div>
          </div>
          <label className="mb-1.5 block text-[13px] font-medium">Nickname</label>
          <NicknameForm current={admin.displayName ?? ''} placeholder="How should we call you?" />
          <p className="mt-2 text-muted">Shown in the sidebar, the top bar and the welcome banner, with your role tag next to it.</p>
        </Card>
        <Card title="Your account">
          <KV items={[['Email', admin.email], ['Global role', roleLabel(admin.role)], ['Theme', roleLabel(await currentTheme())], ['Second factor', 'Authenticator app (required every session)']]} />
        </Card>
        <Card title="Session policy (read only)">
          <KV items={[
            ['Absolute lifetime', `${ABSOLUTE_MS / 3600000} hours`], ['Idle timeout', min(IDLE_MS)],
            ['Step-up window', `${min(STEPUP_MS)} for dangerous actions`], ['Sign-in lockout', `${MAX_FAILURES} failures, ${min(LOCK_MS)}`],
          ]} />
        </Card>
      </div>
    </>
  );
}
