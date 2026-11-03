/**
 * Payments of Donexel, read from Polar's orders. Pure functions (no I/O) so they can be tested:
 * parsing tolerates missing or renamed fields, and filtering happens here on the cached list.
 */
export type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): J => (isObj(v) ? v : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const cents = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const first = (o: J, ...keys: string[]): unknown => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };

export const PLAN_NAMES = ['starter', 'growth', 'scale'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

/** "Growth plan (monthly)" → "growth". Anything else is not a Donexel plan. */
export function planOf(productName: string): PlanName | null {
  const n = productName.toLowerCase();
  return PLAN_NAMES.find((p) => new RegExp(`\\b${p}\\b`).test(n)) ?? null;
}

/** Billing term of the product: "monthly", or 1 to 5 years prepaid. Null when it cannot be told. */
export type Term = 'monthly' | '1y' | '2y' | '3y' | '4y' | '5y';
export const TERM_LABEL: Record<Term, string> = { monthly: 'Monthly', '1y': '1 year', '2y': '2 years', '3y': '3 years', '4y': '4 years', '5y': '5 years' };

/** Prefers Polar's recurring interval; falls back to the product name ("Growth plan (2 years)", "Starter yearly"). */
export function termOf(productName: string, interval?: string, count?: number): Term | null {
  const years = (n: number): Term | null => (Number.isInteger(n) && n >= 1 && n <= 5 ? (`${n}y` as Term) : null);
  if (interval === 'month' && (count ?? 1) === 1) return 'monthly';
  if (interval === 'year') return years(count ?? 1);
  if (interval === 'month' && count && count % 12 === 0) return years(count / 12);
  const n = productName.toLowerCase();
  const m = /\b([1-5])[\s-]*(?:year|yr)s?\b/.exec(n);
  if (m) return years(Number(m[1]));
  if (/\b(?:yearly|annual|annually)\b/.test(n)) return '1y';
  if (/\bmonthly\b/.test(n)) return 'monthly';
  return null;
}

export interface PaymentRow {
  id: string; createdAt: string; status: string;
  /** What the customer paid in the smallest currency unit, tax included when Polar reports it. */
  amount: number; refunded: number; currency: string;
  reason: string; productId: string; productName: string; plan: PlanName | null; term: Term | null;
  email: string; name: string; externalId: string; customerId: string; subscriptionId: string; invoice: string;
}

export function parseOrder(raw: unknown): PaymentRow | null {
  const o = obj(raw);
  const id = text(o.id);
  if (!id) return null;
  const customer = obj(o.customer);
  const product = obj(o.product);
  const productName = text(first(product, 'name') ?? first(o, 'product_name', 'description'));
  const total = first(o, 'total_amount', 'net_amount', 'amount', 'subtotal_amount');
  return {
    id,
    createdAt: text(first(o, 'created_at', 'createdAt')),
    status: text(o.status).toLowerCase() || (o.paid === true ? 'paid' : 'pending'),
    amount: cents(total), refunded: cents(first(o, 'refunded_amount')), currency: (text(o.currency) || 'usd').toLowerCase(),
    reason: text(first(o, 'billing_reason')),
    productId: text(first(o, 'product_id') ?? first(product, 'id')), productName, plan: planOf(productName),
    term: termOf(productName, text(first(product, 'recurring_interval')), Number(first(product, 'recurring_interval_count')) || undefined),
    email: text(first(customer, 'email')), name: text(first(customer, 'name')),
    externalId: text(first(customer, 'external_id')), customerId: text(first(o, 'customer_id') ?? first(customer, 'id')),
    subscriptionId: text(first(o, 'subscription_id')), invoice: text(first(o, 'invoice_number')),
  };
}

/** Orders list from either `{ items: [...] }` or a bare array. */
export function parseOrders(data: unknown): { rows: PaymentRow[]; maxPage: number } {
  const o = obj(data);
  const list = Array.isArray(data) ? data : Array.isArray(o.items) ? o.items : Array.isArray(o.result) ? o.result : [];
  const maxPage = Number(obj(o.pagination).max_page);
  return { rows: list.map(parseOrder).filter((r): r is PaymentRow => r !== null), maxPage: Number.isFinite(maxPage) ? maxPage : 0 };
}

export const REASON_LABEL: Record<string, string> = {
  purchase: 'Purchase', subscription_create: 'New subscription', subscription_cycle: 'Renewal', subscription_update: 'Plan change',
};
export const STATUS_LABEL: Record<string, string> = { paid: 'Paid', pending: 'Pending', refunded: 'Refunded', partially_refunded: 'Partially refunded' };

export interface PaymentFilters { q?: string; plan?: string[]; status?: string[]; from?: string; to?: string; min?: number; max?: number }

export function filterPayments(rows: PaymentRow[], f: PaymentFilters): PaymentRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !`${r.email} ${r.name} ${r.id} ${r.externalId}`.toLowerCase().includes(q)) return false;
    if (f.plan?.length && !(r.plan && f.plan.includes(r.plan))) return false;
    if (f.status?.length && !f.status.includes(r.status)) return false;
    const day = r.createdAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.min !== undefined && r.amount < f.min * 100) return false;
    if (f.max !== undefined && r.amount > f.max * 100) return false;
    return true;
  });
}

export function totals(rows: PaymentRow[]) {
  let paid = 0, refunded = 0, orders = 0;
  for (const r of rows) {
    if (r.status === 'pending') continue;
    orders++;
    paid += r.amount;
    refunded += r.status === 'refunded' ? r.refunded || r.amount : r.refunded;
  }
  return { gross: paid, refunded, net: paid - refunded, orders };
}

/** Filters from URL-style params (the CSV export uses the same ones as the page). */
export function filtersFromParams(sp: Record<string, string | undefined>): PaymentFilters {
  const csv = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const amount = (v?: string) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : undefined; };
  return {
    q: sp.q?.trim() || undefined,
    plan: csv(sp.plan).filter((x) => (PLAN_NAMES as readonly string[]).includes(x)),
    status: csv(sp.status).filter((x) => x in STATUS_LABEL),
    from: day(sp.from), to: day(sp.to), min: amount(sp.min), max: amount(sp.max),
  };
}

/** Product ids from either a comma list ("a,b") or the API's JSON shape ({"starter":{"1y":"id"}, ...}); invalid or blank ids are dropped. */
export function productIdsFrom(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(...v.split(','));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  const t = raw.trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { walk(JSON.parse(t)); } catch { /* not JSON: treated as no ids */ } }
  else walk(t);
  return [...new Set(out.map((s) => s.trim()).filter((s) => /^[\w-]{8,64}$/.test(s)))];
}
