import 'server-only';
import { env } from '@/lib/env';
import { money } from '@/lib/format';

export const SLUG = 'wooflowconnect';
const DEFAULT_BASE = 'https://wooflowconnect.duoplus.org/api/ext/v1';

/** Thrown for any non-2xx answer or network failure. `code` is the API's error code when it sent one. */
export class WfcError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const wfcConfigured = () => !!env().WFC_API_KEY;

type Params = Record<string, string | number | undefined | null>;

async function request(path: string, init: RequestInit & { revalidate?: number }): Promise<unknown> {
  const key = env().WFC_API_KEY;
  if (!key) throw new WfcError(0, 'not_configured', 'WFC_API_KEY is not set');
  const base = (env().WFC_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
  const { revalidate = 0, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${base}/${path}`, {
      ...rest,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(rest.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(10_000),
      ...(revalidate ? { next: { revalidate } } : { cache: 'no-store' as const }),
    });
  } catch {
    throw new WfcError(0, 'unreachable', 'Could not reach the WooFlowConnect server');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    const code = typeof b.error === 'string' ? b.error : `http_${res.status}`;
    throw new WfcError(res.status, code, typeof b.message === 'string' ? b.message : code);
  }
  return body;
}

/** GET an endpoint. `revalidate` seconds of caching; 0 (default) always asks the server. */
export function wfcGet(path: string, params: Params = {}, revalidate = 0): Promise<unknown> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const qs = sp.toString();
  return request(qs ? `${path}?${qs}` : path, { method: 'GET', revalidate });
}

export function wfcPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

/** Raw CSV body from `export?what=...`. */
export async function wfcExport(what: string): Promise<string> {
  const key = env().WFC_API_KEY;
  if (!key) throw new WfcError(0, 'not_configured', 'WFC_API_KEY is not set');
  const base = (env().WFC_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
  const res = await fetch(`${base}/export?what=${encodeURIComponent(what)}`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new WfcError(res.status, `http_${res.status}`, 'Export failed');
  return res.text();
}

/** Minimal RFC 4180 parser so the panel's own CSV route can re-emit the licence server's export (with formula protection). */
export function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------------------
// Tolerant readers. The API documents endpoints but not every field name, so pages read
// through these helpers (first matching key wins) instead of trusting one exact shape.
// ---------------------------------------------------------------------------
export type J = Record<string, unknown>;
export const isObj = (v: unknown): v is J => typeof v === 'object' && v !== null && !Array.isArray(v);
export const obj = (v: unknown): J => (isObj(v) ? v : {});

/** First array found under any of `keys` (or, failing that, the first array value in the object). */
export function list(data: unknown, ...keys: string[]): J[] {
  if (Array.isArray(data)) return data.filter(isObj);
  const o = obj(data);
  for (const k of keys) if (Array.isArray(o[k])) return (o[k] as unknown[]).filter(isObj);
  for (const v of Object.values(o)) if (Array.isArray(v) && v.every(isObj)) return v as J[];
  return [];
}

export function first(r: J, ...keys: string[]): unknown {
  for (const k of keys) { const v = r[k]; if (v !== undefined && v !== null && v !== '') return v; }
  return undefined;
}
export const s = (r: J, ...keys: string[]): string | null => { const v = first(r, ...keys); return v === undefined ? null : String(v); };
export const n = (r: J, ...keys: string[]): number => Number(first(r, ...keys) ?? 0) || 0;
export const b = (r: J, ...keys: string[]): boolean => { const v = first(r, ...keys); return v === true || v === 1 || v === '1' || v === 'true'; };

/** Unix seconds (or ms, or an ISO string) to a Date. */
export function when(v: unknown): Date | null {
  if (v === undefined || v === null || v === '' || v === 0) return null;
  const num = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isNaN(num) ? new Date(String(v)) : new Date(num < 1e12 ? num * 1000 : num);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const whenOf = (r: J, ...keys: string[]) => when(first(r, ...keys));

/** The API sends money in cents. */
export const cents = (v: unknown) => money(Number(v ?? 0) / 100);

/** Server-reported total for a list, or a best guess from the page. */
export function totalOf(data: unknown, rows: number, page: number, per: number): number {
  const t = Number(obj(data).total ?? obj(data).count ?? NaN);
  return Number.isFinite(t) ? t : (page - 1) * per + rows + (rows >= per ? 1 : 0);
}

/** A chart series in any of: [{day,value}], [{date,count}], {"2026-10-01": 3}. */
export function points(v: unknown): { day: string; value: number }[] {
  const toDay = (x: unknown) => { const d = when(x); return d ? d.toISOString().slice(0, 10) : String(x ?? ''); };
  if (Array.isArray(v)) {
    return v.map((p) => {
      if (Array.isArray(p)) return { day: toDay(p[0]), value: Number(p[1] ?? 0) || 0 };
      const r = obj(p);
      return { day: toDay(first(r, 'day', 'date', 't', 'ts', 'label')), value: n(r, 'value', 'count', 'total', 'amount', 'cents', 'n') };
    });
  }
  if (isObj(v)) return Object.entries(v).map(([k, x]) => ({ day: toDay(k), value: Number(x) || 0 })).sort((a, c) => (a.day < c.day ? -1 : 1));
  return [];
}
