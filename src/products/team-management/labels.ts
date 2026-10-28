import type { Tone } from '@/components/ui';

/** Subscription status → badge colour. Unknown values fall back to neutral instead of failing. */
export const STATUS_TONE: Record<string, Tone> = {
  active: 'success', trialing: 'info', comped: 'neutral', past_due: 'warning',
  canceled: 'danger', unpaid: 'danger', incomplete: 'neutral',
};
export const STATUS_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trialing', comped: 'Complimentary', past_due: 'Past due', canceled: 'Canceled', unpaid: 'Unpaid', incomplete: 'No subscription',
};
/** Order and colour of the status breakdown on the overview. */
export const STATUS_ORDER = ['active', 'trialing', 'comped', 'past_due', 'incomplete', 'canceled', 'unpaid'] as const;
export const STATUS_COLOR: Record<string, string> = {
  active: 'var(--chart-1)', trialing: 'var(--chart-2)', comped: 'var(--chart-5)', past_due: 'var(--chart-3)',
  incomplete: 'var(--chart-grid)', canceled: 'var(--chart-4)', unpaid: 'var(--chart-4)',
};

/** "past_due" → "Past due" for values this panel does not know about. */
export const humanize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/[_-]/g, ' ') : '—');
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? humanize(s);
export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? 'neutral';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
