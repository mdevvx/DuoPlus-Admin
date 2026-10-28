import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';

export const SLUG = 'team-management';

/** Thrown for any non-2xx answer, network failure or unexpected response. `code` is the API's error code when it sent one. */
export class TmsError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const tmsConfigured = () => !!(env().DUOPLUS_API_URL && env().DUOPLUS_ADMIN_KEY);

/** DUOPLUS_API_URL may be the API's domain or already include /api/v1/admin; both work. */
export function adminBase(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  if (u.endsWith('/api/v1/admin')) return u;
  if (u.endsWith('/api/v1')) return `${u}/admin`;
  return `${u}/api/v1/admin`;
}

async function request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<unknown> {
  const { DUOPLUS_API_URL: url, DUOPLUS_ADMIN_KEY: key } = env();
  if (!url || !key) throw new TmsError(0, 'not_configured', 'DUOPLUS_API_URL and DUOPLUS_ADMIN_KEY are not both set');
  let res: Response;
  try {
    res = await fetch(`${adminBase(url)}${path}`, {
      method,
      // The key is sent only from the server and is never logged or included in an error message.
      headers: { 'x-admin-key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TmsError(0, 'unreachable', 'Could not reach the Team Management System API');
  }
  if (res.status === 204) return null;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as { error?: { message?: unknown; code?: unknown } } | null)?.error;
    throw new TmsError(res.status, typeof e?.code === 'string' ? e.code : `http_${res.status}`, typeof e?.message === 'string' ? e.message : `http_${res.status}`);
  }
  return json;
}

// ---- Responses. Every field has a fallback so an unexpected value renders defensively instead of breaking the page. ----
const num = z.coerce.number().catch(0);
const str = z.string().catch('');
const count = z.object({ total: num, new30d: num }).catch({ total: 0, new30d: 0 });
const tally = z.record(z.string(), num).catch({});

export const overviewSchema = z.object({
  generatedAt: str,
  users: count,
  workspaces: count,
  subscriptions: z.object({ byStatus: tally, byPlan: tally, whitelisted: num }).catch({ byStatus: {}, byPlan: {}, whitelisted: 0 }),
  billing: z.object({ payingAccounts: num, trialingAccounts: num, trialsEndingIn3Days: num, mrrCents: num })
    .catch({ payingAccounts: 0, trialingAccounts: 0, trialsEndingIn3Days: 0, mrrCents: 0 }),
});
export type Overview = z.infer<typeof overviewSchema>;

const workspaceSchema = z.object({
  id: str,
  name: z.string().catch('Untitled workspace'),
  logoUrl: z.string().nullable().catch(null),
  createdAt: str,
  onboardingCompleted: z.boolean().catch(false),
  owner: z.object({ id: str, email: str, fullName: z.string().nullable().catch(null) }).nullable().catch(null),
  plan: str,
  status: str,
  whitelisted: z.boolean().catch(false),
  members: num,
  seatLimit: num,
});
export type Workspace = z.infer<typeof workspaceSchema>;

const workspacesSchema = z.object({ page: num, pageSize: num, total: num, items: z.array(workspaceSchema).catch([]) });
const whitelistEntrySchema = z.object({ email: str, plan: str, note: z.string().nullable().catch(null), createdAt: str });
export type WhitelistEntry = z.infer<typeof whitelistEntrySchema>;
const addResultSchema = z.object({ email: str, plan: str, workspaces: num, activeSubscription: z.boolean().catch(false) });
export type AddResult = z.infer<typeof addResultSchema>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Team Management System API sent an unexpected response');
  return r.data;
}

export const getOverview = async () => parse(overviewSchema, await request('GET', '/overview'));

export async function listWorkspaces(p: { search?: string; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.search) sp.set('search', p.search);
  return parse(workspacesSchema, await request('GET', `/workspaces?${sp}`));
}

export const listWhitelist = async () => parse(z.array(whitelistEntrySchema).catch([]), await request('GET', '/whitelist'));

export const addWhitelist = async (body: { email: string; plan: string; note?: string }) => parse(addResultSchema, await request('POST', '/whitelist', body));

/** Resolves when removed; throws TmsError with status 404 when the email is not on the list. */
export async function removeWhitelist(email: string): Promise<void> {
  await request('DELETE', `/whitelist/${encodeURIComponent(email)}`);
}

// ---- Presentation helpers ----
export const PLAN_LABEL: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };
export const PLANS = ['starter', 'growth', 'scale'] as const;

/** Polar dashboard link. DuoPlus uses Polar sandbox or production by its own setting, so the two are never mixed. */
export function polarLink(): string {
  const e = env();
  const host = e.TMS_POLAR_ENV === 'sandbox' ? 'https://sandbox.polar.sh' : 'https://polar.sh';
  const org = e.TMS_POLAR_ORG_SLUG ?? e.POLAR_DASHBOARD_ORG_SLUG;
  return org && /^[\w-]+$/.test(org) ? `${host}/dashboard/${org}/sales` : `${host}/dashboard`;
}

/** Plain-language reason for a failed call, safe to show to an admin. */
export function describe(e: unknown): string {
  if (!(e instanceof TmsError)) return 'Could not load data from the Team Management System.';
  if (e.code === 'not_configured') return 'The Team Management System connection is not set up. Add DUOPLUS_API_URL and DUOPLUS_ADMIN_KEY to the environment and redeploy.';
  if (e.status === 401) return 'The Team Management System rejected the admin key (wrong, missing or changed).';
  if (e.status === 404) return 'The Team Management System operator API answered 404. Its ADMIN_API_KEY is probably not set, or DUOPLUS_API_URL is wrong.';
  if (e.status === 429) return 'The Team Management System rate limit was reached (120 requests per minute). Try again shortly.';
  if (e.code === 'unreachable') return 'Could not reach the Team Management System API.';
  if (e.code === 'bad_response') return 'The Team Management System API sent a response this panel could not read.';
  return 'The Team Management System API returned an error.';
}
