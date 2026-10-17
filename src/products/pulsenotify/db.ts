import 'server-only';
import { serviceClient, must, type Db } from '@/lib/supabase-server';

export const SLUG = 'pulsenotify';
/** Service-role client on the pulsenotify schema. Only call after requireAdmin(). */
export const pn = (): Db => serviceClient('pulsenotify');

export const T = {
  guilds: 'pulsenotify_guilds',
  billing: 'pulsenotify_billing',
  payments: 'pulsenotify_payments',
  contacts: 'pulsenotify_user_contacts',
  contactEmails: 'pulsenotify_contact_emails',
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
