import 'server-only';
import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { polarSandbox } from '@/lib/polar-env';
import { polarApiBase } from '@/lib/polar-hosts';
import { parseOrders, type PaymentRow } from './payments';

const LIMIT = 100;
const MAX_PAGES = 5; // the latest 500 orders; plenty for a monthly SaaS, and it keeps each load fast

/** Donexel's Polar environment. It must match the token's: sandbox and live never mix. */
export const polarEnv = () => (polarSandbox('donexel') ? 'sandbox' : 'production');

/** Its own token, or the panel's live token when both point at the same Polar environment. */
function token(): string | null {
  const e = env();
  if (e.DONEXEL_POLAR_ACCESS_TOKEN) return e.DONEXEL_POLAR_ACCESS_TOKEN;
  const panelEnv = polarSandbox('bot') ? 'sandbox' : 'production';
  return panelEnv === polarEnv() ? e.DISCONOTIFY_POLAR_ACCESS_TOKEN ?? null : null;
}

export const polarPaymentsConfigured = () => !!token();
const apiBase = () => polarApiBase(polarSandbox('donexel'));

export class PolarError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function get(path: string, tk: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  } catch {
    throw new PolarError(0, 'unreachable', 'Could not reach Polar');
  }
  if (!res.ok) throw new PolarError(res.status, `http_${res.status}`, `Polar answered ${res.status}`);
  return res.json().catch(() => { throw new PolarError(0, 'bad_response', 'Polar sent an unreadable response'); });
}

/** Latest orders for Donexel's three plans, newest first. Cached for a minute. */
const latestOrders = unstable_cache(async (productIds: string): Promise<PaymentRow[]> => {
  const tk = token();
  if (!tk) throw new PolarError(0, 'not_configured', 'No Polar token');
  const ids = productIds.split(',').filter(Boolean);
  const out: PaymentRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sp = new URLSearchParams({ page: String(page), limit: String(LIMIT), sorting: '-created_at' });
    for (const id of ids) sp.append('product_id', id);
    const { rows, maxPage } = parseOrders(await get(`orders/?${sp}`, tk));
    out.push(...rows);
    if (rows.length < LIMIT || (maxPage && page >= maxPage)) break;
  }
  // Without product ids the whole organisation is fetched, so keep only orders for our three plans.
  return ids.length ? out : out.filter((r) => r.plan !== null);
}, ['tms-polar-orders'], { revalidate: 60 });

export async function listPayments(): Promise<{ rows: PaymentRow[]; byProductIds: boolean }> {
  const ids = env().DONEXEL_POLAR_PRODUCT_IDS?.split(',').map((s) => s.trim()).filter((s) => /^[\w-]{8,64}$/.test(s)).join(',') ?? '';
  return { rows: await latestOrders(ids), byProductIds: ids !== '' };
}

export function describePolar(e: unknown): string {
  if (!(e instanceof PolarError)) return 'Could not load payments from Polar.';
  if (e.code === 'not_configured') return 'Polar is not connected for Donexel. Add DONEXEL_POLAR_ACCESS_TOKEN (a Polar token with order read access).';
  if (e.status === 401 || e.status === 403) return 'Polar rejected the token. It may be wrong, expired, from the other Polar environment, or missing order read access.';
  if (e.status === 429) return 'Polar rate limit reached. Try again in a minute.';
  if (e.code === 'unreachable') return 'Could not reach Polar.';
  return 'Polar returned an error.';
}
