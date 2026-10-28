import type { ReactNode } from 'react';
import { Badge, Card, EmptyState, ErrorPanel } from '@/components/ui';
import { PLAN_LABEL, SLUG, describe, tmsConfigured } from '../api';
import { humanize, statusLabel, statusTone } from '../labels';

export const base = `/p/${SLUG}`;

type Loaded<T> = { ok: true; data: T } | { ok: false; panel: ReactNode };

/** Runs an API call and turns every failure (not set up, bad key, unreachable…) into a panel the page can show. */
export async function load<T>(fn: () => Promise<T>, retryHref: string): Promise<Loaded<T>> {
  if (!tmsConfigured()) {
    return { ok: false, panel: <Card><EmptyState title="Donexel is not connected" hint="Add DONEXEL_API_URL and DONEXEL_ADMIN_KEY to the environment and redeploy." /></Card> };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, panel: <ErrorPanel message={describe(e)} retryHref={retryHref} /> };
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

export function PlanText({ plan }: { plan: string }) {
  return <>{plan ? PLAN_LABEL[plan] ?? humanize(plan) : '—'}</>;
}
