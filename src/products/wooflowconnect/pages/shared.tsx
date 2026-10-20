import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Card, EmptyState, ErrorPanel, Tr, When, type Tone } from '@/components/ui';
import { sentence } from '@/lib/format';
import { SLUG, WfcError, cents, n, s, whenOf, wfcConfigured, type J } from '../api';

export const base = `/p/${SLUG}`;

type Loaded<T> = { ok: true; data: T } | { ok: false; panel: ReactNode };

/** Run an API call and turn failures into a ready-to-render panel (not configured, bad key, unreachable...). */
export async function load<T>(fn: () => Promise<T>, retryHref: string): Promise<Loaded<T>> {
  if (!wfcConfigured()) {
    return { ok: false, panel: <Card><EmptyState title="WooFlowConnect API key not set" hint="Add WFC_API_KEY (from the licence server's API keys tab) to the environment and redeploy." /></Card> };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = e instanceof WfcError ? e : null;
    const message = !err ? 'Could not load data from WooFlowConnect.'
      : err.status === 401 ? 'The WooFlowConnect API key was rejected (wrong, expired or revoked).'
      : err.code === 'ip_not_allowed' ? "This server's IP is not on the API key's allowlist."
      : err.status === 429 ? 'WooFlowConnect rate limit reached. Try again in a minute.'
      : err.code === 'unreachable' ? 'Could not reach the WooFlowConnect licence server.'
      : 'WooFlowConnect returned an error.';
    return { ok: false, panel: <ErrorPanel message={message} retryHref={retryHref} /> };
  }
}

const PLAN_TONE: Record<string, Tone> = {
  active: 'success', trialing: 'info', ready: 'neutral', none: 'neutral', past_due: 'danger', canceled: 'warning', suspended: 'danger', canceling: 'warning',
};
export function PlanBadge({ state }: { state: string | null }) {
  const k = (state ?? 'none').toLowerCase();
  return <Badge tone={PLAN_TONE[k] ?? 'neutral'}>{k === 'past_due' ? 'Past due' : sentence(k)}</Badge>;
}

const STORE_TONE: Record<string, Tone> = { online: 'success', quiet: 'warning', stale: 'danger', released: 'neutral' };
export function StoreBadge({ state }: { state: string | null }) {
  const k = (state ?? '').toLowerCase();
  return <Badge tone={STORE_TONE[k] ?? 'neutral'}>{sentence(k) === '—' ? 'Unknown' : sentence(k)}</Badge>;
}

export function CustomerLink({ id, label }: { id: unknown; label: ReactNode }) {
  if (id === undefined || id === null || id === '') return <>{label}</>;
  return <Link className="inline-block max-w-full truncate align-bottom font-medium text-accent hover:underline" data-row-link href={`${base}/customers/${encodeURIComponent(String(id))}`}>{label}</Link>;
}

/** Plan state of a customer row, whichever field the API used. */
export const planOf = (r: J) => s(r, 'plan_state', 'state', 'plan', 'status');

export const PAYMENT_TONE = (status: string | null): Tone => {
  const k = (status ?? '').toLowerCase();
  return ['paid', 'succeeded', 'success'].includes(k) ? 'success' : ['failed', 'declined'].includes(k) ? 'danger' : k === 'refunded' ? 'warning' : 'neutral';
};

/** Compact payments table used on the customer page. */
export function PaymentRows({ rows }: { rows: J[] }) {
  if (rows.length === 0) return <EmptyState compact title="No payments" />;
  return (
    <table className="w-full border-collapse text-sm" aria-label="Payments">
      <thead><tr><th className="th">Date</th><th className="th">Kind</th><th className="th">Status</th><th className="th text-right">Amount</th></tr></thead>
      <tbody>{rows.map((p, i) => (
        <Tr key={i}>
          <td className="td"><When value={whenOf(p, 'at', 'created_at', 'date', 'ts')} /></td>
          <td className="td">{sentence(s(p, 'kind', 'type'))}</td>
          <td className="td"><Badge tone={PAYMENT_TONE(s(p, 'status'))}>{sentence(s(p, 'status'))}</Badge></td>
          <td className="td num text-right">{cents(n(p, 'amount', 'amount_cents', 'cents'))}</td>
        </Tr>
      ))}</tbody>
    </table>
  );
}
