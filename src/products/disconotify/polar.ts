import 'server-only';
import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { polarSandbox } from '@/lib/polar-env';
import { polarApiBase, polarDashboardHost } from '@/lib/polar-hosts';
import { pn, T, type Row } from './db';

type Mode = 'current' | 'other' | 'unknown';

/** Looks a Polar reference up in the environment the panel follows (DISCONOTIFY_POLAR_SANDBOX), with that environment's token. */
async function ask(path: string, token: string): Promise<number> {
  const res = await fetch(`${polarApiBase(polarSandbox())}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
  return res.status;
}

/**
 * Is this Polar reference known to the Polar environment the panel follows? A payment from the other environment
 * (sandbox leftovers on a live panel, or live payments on a sandbox panel) is a 404 there. Anything inconclusive
 * (no token, missing scope, outage) stays "unknown" and is treated as belonging here, so real revenue is never hidden by mistake.
 */
const modeOf = unstable_cache(async (ref: string): Promise<Mode> => {
  const token = env().DISCONOTIFY_POLAR_ACCESS_TOKEN;
  if (!token || !/^[\w-]{6,64}$/.test(ref)) return 'unknown';
  try {
    const order = await ask(`orders/${ref}`, token);
    if (order === 200) return 'current';
    if (order !== 404) return 'unknown';
    // The stored reference may be an order, a checkout or a subscription ID: another environment only if this one knows none of them.
    for (const kind of ['checkouts', 'subscriptions']) {
      const status = await ask(`${kind}/${ref}`, token);
      if (status === 200) return 'current';
      if (status !== 404) return 'unknown';
    }
    return 'other';
  } catch {
    return 'unknown';
  }
}, ['polar-payment-mode', polarApiBase(polarSandbox())], { revalidate: 300 });

/**
 * IDs (notify_payments.id) of Polar payments that belong to the OTHER environment than the one the panel follows:
 * sandbox payments on a live panel, live payments on a sandbox panel. They never count toward this mode's totals.
 */
export async function testPaymentIds(): Promise<string[]> {
  const { data } = await pn().from(T.payments).select('id,external_id,checkout_url').eq('provider', 'polar').limit(2000);
  const all = (data ?? []) as Row[];
  // A stored checkout URL on the other environment's dashboard host is conclusive on its own; no API call needed.
  const otherHost = new URL(polarDashboardHost(!polarSandbox())).hostname;
  const otherUrl = (r: Row) => { try { return new URL(String(r.checkout_url)).hostname === otherHost; } catch { return false; } };
  const out: string[] = all.filter(otherUrl).map((r) => String(r.id));
  const rows = all.filter((r) => r.external_id && !otherUrl(r));
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const modes = await Promise.all(chunk.map((r) => modeOf(String(r.external_id))));
    chunk.forEach((r, j) => { if (modes[j] === 'other') out.push(String(r.id)); });
  }
  return out;
}

/** Same filter for any query on a column holding payment IDs. No-op when there are no sandbox payments. */
export function excludeTest<Q>(q: Q, testIds: string[], col = 'id'): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return testIds.length ? (q as any).not(col, 'in', `(${testIds.join(',')})`) : q;
}
