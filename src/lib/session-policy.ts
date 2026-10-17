export const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const IDLE_MS = 30 * 60 * 1000;
export const STEPUP_MS = 10 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;

export const COOKIE = {
  started: 'hub_started', // signed: when the aal2 session began
  active: 'hub_active', // signed: last activity
  stepup: 'hub_stepup', // signed: last MFA challenge
  theme: 'hub_theme',
} as const;

export const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/** Pure policy check used by middleware (and unit-tested). */
export function sessionState(now: number, startedAt: number | null, activeAt: number | null): 'ok' | 'expired' | 'idle' | 'missing' {
  if (startedAt === null || activeAt === null) return 'missing';
  if (now - startedAt > ABSOLUTE_MS) return 'expired';
  if (now - activeAt > IDLE_MS) return 'idle';
  return 'ok';
}
