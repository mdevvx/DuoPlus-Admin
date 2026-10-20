import 'server-only';
import { serviceClient, must, type Db } from '@/lib/supabase-server';
import { env } from '@/lib/env';

export const SLUG = 'pulsenotify';
/** Service-role client on the pulsenotify schema. Only call after requireAdmin(). */
export const pn = (): Db => serviceClient('pulsenotify');

export const T = {
  guilds: 'pulsenotify_guilds',
  billing: 'pulsenotify_billing',
  payments: 'pulsenotify_payments',
  contacts: 'pulsenotify_user_contacts',
  contactEmails: 'pulsenotify_contact_emails',
  dmLog: 'pulsenotify_dm_log',
  accounts: 'pulsenotify_platform_accounts',
  channels: 'pulsenotify_notification_channels',
  alerts: 'pulsenotify_alert_configurations',
  events: 'pulsenotify_events',
  live: 'pulsenotify_live_states',
  health: 'pulsenotify_platform_health',
  botAudit: 'pulsenotify_audit_logs',
  botState: 'pulsenotify_bot_state',
} as const;

export type Row = Record<string, unknown>;

/** Servers used for testing (TEST_GUILD_IDS). Their payments are test/sandbox payments, not live revenue. */
export const testGuildIds = (): string[] => (env().TEST_GUILD_IDS ?? '').split(',').map((x) => x.trim()).filter((x) => /^\d{5,25}$/.test(x));
export const isTestGuild = (id: unknown): boolean => id !== null && id !== undefined && testGuildIds().includes(String(id));

/** Keep only live data: drops rows of test servers from a Supabase query. No-op when no test servers are configured. */
export function liveOnly<Q>(q: Q, col = 'guild_id'): Q {
  const ids = testGuildIds();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ids.length ? (q as any).not(col, 'in', `(${ids.join(',')})`) : q;
}

/** First present, non-null value among candidate column names (schema is introspected, names may vary). */
export function pick(row: Row | null | undefined, ...names: string[]): string | null {
  for (const n of names) {
    const v = row?.[n];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}

export const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
export const num = (v: unknown): number => Number(v ?? 0) || 0;
export const iso = (d: Date) => d.toISOString();
export const daysFrom = (n: number, from = Date.now()) => new Date(from + n * 86400000);

export { must };

/** Head-count helper. Returns 0 (and logs) on error rather than failing a whole dashboard. */
export async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const r = await q;
  if (r.error) { console.error('count failed:', r.error.message); return 0; }
  return r.count ?? 0;
}
