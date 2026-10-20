import 'server-only';
import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { pn, T, type Row } from './db';

const LIVE_API = 'https://api.polar.sh/v1';
type Mode = 'live' | 'test' | 'unknown';

async function ask(path: string, token: string): Promise<number> {
  const res = await fetch(`${LIVE_API}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
  return res.status;
}

/**
 * Is this Polar reference known to the LIVE Polar account? Sandbox payments live in a separate Polar
 * environment, so the live API answers 404 for them. Anything inconclusive (no token, missing scope,
 * outage) stays "unknown" and is treated as live, so real revenue is never hidden by mistake.
 */
const modeOf = unstable_cache(async (ref: string): Promise<Mode> => {
  const token = env().POLAR_ACCESS_TOKEN;
  if (!token || !/^[\w-]{6,64}$/.test(ref)) return 'unknown';
  try {
    const order = await ask(`orders/${ref}`, token);
    if (order === 200) return 'live';
    if (order !== 404) return 'unknown';
    // The stored reference may be an order, a checkout or a subscription ID: sandbox only if live knows none of them.
    for (const kind of ['checkouts', 'subscriptions']) {
      const status = await ask(`${kind}/${ref}`, token);
      if (status === 200) return 'live';
      if (status !== 404) return 'unknown';
    }
    return 'test';
  } catch {
    return 'unknown';
  }
}, ['polar-payment-mode'], { revalidate: 300 });

/** IDs (pulsenotify_payments.id) of payments that belong to Polar's sandbox, not the live account. */
export async function testPaymentIds(): Promise<string[]> {
  const { data } = await pn().from(T.payments).select('id,external_id').eq('provider', 'polar').limit(2000);
  const rows = ((data ?? []) as Row[]).filter((r) => r.external_id);
  if (env().POLAR_ENV === 'sandbox') return rows.map((r) => String(r.id)); // a sandbox-configured panel only ever sees sandbox data
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const modes = await Promise.all(chunk.map((r) => modeOf(String(r.external_id))));
    chunk.forEach((r, j) => { if (modes[j] === 'test') out.push(String(r.id)); });
  }
  return out;
}

/** Same filter for any query on a column holding payment IDs. No-op when there are no sandbox payments. */
export function excludeTest<Q>(q: Q, testIds: string[], col = 'id'): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return testIds.length ? (q as any).not(col, 'in', `(${testIds.join(',')})`) : q;
}
