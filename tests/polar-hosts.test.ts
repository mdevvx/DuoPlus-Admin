import { describe, expect, it } from 'vitest';
import { polarApiBase, polarDashboardHost, polarDashboardUrl, sandboxFromSettings } from '@/lib/polar-hosts';

describe('polar hosts', () => {
  it('uses the sandbox hosts only in sandbox mode', () => {
    expect(polarApiBase(false)).toBe('https://api.polar.sh/v1');
    expect(polarApiBase(true)).toBe('https://sandbox-api.polar.sh/v1');
    expect(polarDashboardHost(false)).toBe('https://polar.sh');
    expect(polarDashboardHost(true)).toBe('https://sandbox.polar.sh');
  });
  it('builds dashboard links from a safe slug and falls back to the dashboard', () => {
    expect(polarDashboardUrl(true, 'my-org', '/sales')).toBe('https://sandbox.polar.sh/dashboard/my-org/sales');
    expect(polarDashboardUrl(false, 'my-org')).toBe('https://polar.sh/dashboard/my-org');
    expect(polarDashboardUrl(false, '../evil')).toBe('https://polar.sh/dashboard');
    expect(polarDashboardUrl(true)).toBe('https://sandbox.polar.sh/dashboard');
  });
  it('reads DISCONOTIFY_POLAR_SANDBOX like the bot, with DISCONOTIFY_POLAR_ENV as the older fallback', () => {
    expect(sandboxFromSettings('true')).toBe(true);
    expect(sandboxFromSettings('false', 'sandbox')).toBe(false);
    expect(sandboxFromSettings(undefined, 'sandbox')).toBe(true);
    expect(sandboxFromSettings(undefined, 'production')).toBe(false);
    expect(sandboxFromSettings(undefined)).toBe(false);
  });
});
