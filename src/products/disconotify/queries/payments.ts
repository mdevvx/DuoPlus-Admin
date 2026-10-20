import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, uuid } from '@/lib/validation';
import { pn, T, must, num, type Row } from '../db';
import { testPaymentIds } from '../polar';

/** A payment by its ID or provider reference (exact match). */
export async function searchPayments(q: string) {
  if (!/^[\w-]{6,64}$/.test(q)) return [];
  const base = pn().from(T.payments).select('id,guild_id,external_id,status,amount_usd');
  const res = await (uuid.safeParse(q).success ? base.eq('id', q) : base.eq('external_id', q)).limit(3);
  return res.error ? [] : ((res.data ?? []) as Row[]);
}

export const paymentParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  provider: z.enum(['polar', 'nowpayments']).optional().catch(undefined),
  status: z.enum(['pending', 'paid', 'failed', 'expired']).optional().catch(undefined),
  mode: z.enum(['live', 'test', 'all']).catch('live'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  min: z.coerce.number().min(0).max(1e6).optional().catch(undefined),
  max: z.coerce.number().min(0).max(1e6).optional().catch(undefined),
  ext: z.string().trim().max(120).optional().catch(undefined),
});
export type PaymentParams = z.infer<typeof paymentParams>;

// Supabase's builder types are too deep to thread through a generic helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apply(q: any, p: PaymentParams, test: string[]): any {
  let r = q;
  if (p.provider) r = r.eq('provider', p.provider);
  if (p.status) r = r.eq('status', p.status);
  if (p.mode === 'test') r = r.in('id', test.length ? test : ['00000000-0000-0000-0000-000000000000']);
  if (p.mode === 'live' && test.length) r = r.not('id', 'in', `(${test.join(',')})`);
  if (p.from) r = r.gte('created_at', `${p.from}T00:00:00Z`);
  if (p.to) r = r.lte('created_at', `${p.to}T23:59:59Z`);
  if (p.min !== undefined) r = r.gte('amount_usd', p.min);
  if (p.max !== undefined) r = r.lte('amount_usd', p.max);
  if (p.ext) r = r.eq('external_id', p.ext);
  return r;
}

export async function listPayments(p: PaymentParams) {
  const test = await testPaymentIds();
  const res = await apply(pn().from(T.payments).select('*', { count: 'exact' }), p, test)
    .order('created_at', { ascending: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  const rows = must(res, 'payments') as Row[];

  // totals over the filtered set (paid only), capped for safety
  const totalRes = await apply(pn().from(T.payments).select('amount_usd,status,id'), p, test).eq('status', 'paid').limit(20000);
  const paidRows = (totalRes.data ?? []) as Row[];
  const paidTotal = paidRows.filter((r) => !test.includes(String(r.id))).reduce((a, r) => a + num(r.amount_usd), 0);
  const testPaidTotal = paidRows.filter((r) => test.includes(String(r.id))).reduce((a, r) => a + num(r.amount_usd), 0);
  const guildIds = [...new Set(rows.map((r) => r.guild_id).filter(Boolean).map(String))];
  const billing = guildIds.length ? (((await pn().from(T.billing).select('guild_id,card_subscription_id').in('guild_id', guildIds)).data ?? []) as Row[]) : [];
  // How many sandbox payments exist, so the live view can point at them.
  const testCount = test.length;
  return { rows, test: new Set(test), total: res.count ?? rows.length, paidTotal, testPaidTotal, testCount, subByGuild: Object.fromEntries(billing.map((b) => [String(b.guild_id), (b.card_subscription_id as string | null) ?? null])) };
}

export async function exportPayments(sp: Record<string, string | undefined>) {
  const p = paymentParams.parse(sp);
  const test = await testPaymentIds();
  const { data, error } = await apply(pn().from(T.payments).select('id,provider,external_id,guild_id,months,amount_usd,status,created_at,paid_at'), p, test)
    .order('created_at', { ascending: false }).limit(10000);
  if (error) throw new Error('export query failed');
  return ((data ?? []) as Row[]).map(({ id, ...r }) => ({ mode: test.includes(String(id)) ? 'sandbox' : 'live', ...r }));
}
