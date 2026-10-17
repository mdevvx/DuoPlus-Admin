export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n: number | string | null | undefined) => usd.format(Number(n ?? 0));
export const int = (n: number | string | null | undefined) => new Intl.NumberFormat('en-US').format(Number(n ?? 0));

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
export function dateOnly(v: string | Date | null | undefined): string {
  return dateTime(v).slice(0, 10) || '—';
}

export function relative(v: string | Date | null | undefined, now = Date.now()): string {
  if (!v) return '—';
  const ms = new Date(v).getTime() - now;
  if (Number.isNaN(ms)) return '—';
  const abs = Math.abs(ms);
  if (abs < 6e4) return 'just now';
  const unit = abs < 3.6e6 ? [Math.round(abs / 6e4), 'm'] : abs < 8.64e7 ? [Math.round(abs / 3.6e6), 'h'] : [Math.round(abs / 8.64e7), 'd'];
  return ms >= 0 ? `in ${unit[0]}${unit[1]}` : `${unit[0]}${unit[1]} ago`;
}

/** "past_due" / "PAST DUE" -> "Past due": first letter capital, the rest lower case. */
export function sentence(v: string | null | undefined): string {
  const s = (v ?? '').replace(/[_.]+/g, ' ').trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

const PLATFORMS: Record<string, string> = {
  youtube: 'YouTube', kick: 'Kick', instagram: 'Instagram', twitter: 'Twitter / X', x: 'Twitter / X',
  twitch: 'Twitch', tiktok: 'TikTok', facebook: 'Facebook', reddit: 'Reddit', discord: 'Discord',
};
/** Platform names keep their brand capitalisation. */
export function platformLabel(v: string | null | undefined): string {
  const k = (v ?? '').trim().toLowerCase();
  return PLATFORMS[k] ?? sentence(v);
}

/** Tone for a free-text status value. */
export function statusTone(v: string | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  const s = (v ?? '').toLowerCase();
  if (['ok', 'healthy', 'operational', 'up', 'active', 'paid', 'valid', 'live'].includes(s)) return 'success';
  if (['degraded', 'warn', 'warning', 'pending', 'trialing', 'canceled', 'cancelled'].includes(s)) return 'warning';
  if (['down', 'error', 'failed', 'past_due', 'unpaid', 'incident', 'outage'].includes(s)) return 'danger';
  return 'neutral';
}

const PROVIDERS: Record<string, string> = { polar: 'Polar', nowpayments: 'NOWPayments' };
export function providerLabel(v: string | null | undefined): string {
  return PROVIDERS[(v ?? '').toLowerCase()] ?? sentence(v);
}
