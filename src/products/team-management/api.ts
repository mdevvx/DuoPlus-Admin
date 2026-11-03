import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import { polarSandbox } from '@/lib/polar-env';
import { polarDashboardUrl } from '@/lib/polar-hosts';

export const SLUG = 'team-management';

/** Thrown for any non-2xx answer, network failure or unexpected response. `code` is the API's error code when it sent one. */
export class TmsError extends Error {
  /** `body` is the parsed error answer, for routes (send, test) that return details with a 502. */
  constructor(public status: number, public code: string, message: string, public body?: unknown) { super(message); }
}

/** The Donexel operator API address and key (DONEXEL_*, or the older DUOPLUS_* names). */
export function connection(): { url: string | undefined; key: string | undefined } {
  const e = env();
  return { url: e.DONEXEL_API_URL ?? e.DUOPLUS_API_URL, key: e.DONEXEL_ADMIN_KEY ?? e.DUOPLUS_ADMIN_KEY };
}
export const tmsConfigured = () => { const c = connection(); return !!(c.url && c.key); };

/** DONEXEL_API_URL may be the API's domain or already include /api/v1/admin; both work. */
export function adminBase(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  if (u.endsWith('/api/v1/admin')) return u;
  if (u.endsWith('/api/v1')) return `${u}/admin`;
  return `${u}/api/v1/admin`;
}

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** One call to the operator API. Exported for the email module so the address, key header, timeout and errors live in one place. */
export async function request(method: Method, path: string, body?: Record<string, unknown>): Promise<unknown> {
  const { url, key } = connection();
  if (!url || !key) throw new TmsError(0, 'not_configured', 'DONEXEL_API_URL and DONEXEL_ADMIN_KEY are not both set');
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
    throw new TmsError(0, 'unreachable', 'Could not reach the Donexel API');
  }
  if (res.status === 204) return null;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // Errors are { error: { message, code } }; a hosting platform's own error page is { status, code, message } instead.
    const top = (json ?? {}) as { error?: { message?: unknown; code?: unknown }; message?: unknown; code?: unknown };
    const e = top.error ?? top;
    throw new TmsError(res.status, typeof e.code === 'string' ? e.code : `http_${res.status}`, typeof e.message === 'string' ? e.message : `http_${res.status}`, json);
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
  // What is being paid for: monthly or a prepaid 1 to 5 years. null when nothing is being paid (complimentary, no subscription yet, or cancelled).
  billingTerm: z.string().nullable().catch(null),
  // The workspace's own email account, never with credentials. verified is false until a test email has gone through.
  ownEmail: z.object({ host: str, fromEmail: str, verified: z.boolean().catch(false) }).nullable().catch(null),
  brandColor: z.string().nullable().catch(null), // an accent id (gold…), a #rrggbb hex, or null for the default look
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
const whitelistEntrySchema = z.object({ email: str, plan: str, note: z.string().nullable().catch(null), seats: z.coerce.number().int().positive().nullable().catch(null), createdAt: str });
export type WhitelistEntry = z.infer<typeof whitelistEntrySchema>;
const addResultSchema = z.object({ email: str, plan: str, workspaces: num, activeSubscription: z.boolean().catch(false) });
export type AddResult = z.infer<typeof addResultSchema>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Donexel API sent an unexpected response');
  return r.data;
}

export const getOverview = async () => parse(overviewSchema, await request('GET', '/overview'));

export async function listWorkspaces(p: { search?: string; userId?: string; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.search) sp.set('search', p.search);
  if (p.userId) sp.set('userId', p.userId); // only the workspaces this person belongs to
  return parse(workspacesSchema, await request('GET', `/workspaces?${sp}`));
}

/** Seats in use: people counted once per workspace they belong to. A person in two workspaces counts twice. */
export const sumMembers = (items: { members: number }[]) => items.reduce((a, w) => a + (Number.isFinite(w.members) ? w.members : 0), 0);

/** Every workspace, read page by page (at most 2,000). */
export async function listAllWorkspaces(): Promise<Workspace[]> {
  const out: Workspace[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await listWorkspaces({ page, pageSize: 100 });
    out.push(...r.items);
    if (r.items.length < 100 || out.length >= r.total) break;
  }
  return out;
}

const userSchema = z.object({
  id: str, email: str, fullName: z.string().nullable().catch(null), avatarUrl: z.string().nullable().catch(null), createdAt: str,
  emailConfirmed: z.boolean().nullable().catch(null), lastSignInAt: z.string().nullable().catch(null), twoFactorEnabled: z.boolean().nullable().catch(null),
  whitelisted: z.boolean().catch(false),
  // An empty list means the person has no workspace.
  workspaces: z.array(z.object({ id: str, name: z.string().catch('Untitled workspace'), role: z.string().catch('') }).catch({ id: '', name: 'Untitled workspace', role: '' })).catch([]),
});
export type AppUser = z.infer<typeof userSchema>;
const usersSchema = z.object({ page: num, pageSize: num, total: num, items: z.array(userSchema).catch([]) });

/** Every account, including people with no workspace. GET /users?search=&page=&pageSize= (at most 100 per page). */
export async function listUsers(p: { search?: string; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.search) sp.set('search', p.search);
  return parse(usersSchema, await request('GET', `/users?${sp}`));
}

/** Every account, read page by page (at most 2,000). */
export async function listAllUsers(): Promise<AppUser[]> {
  const out: AppUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await listUsers({ page, pageSize: 100 });
    out.push(...r.items);
    if (r.items.length < 100 || out.length >= r.total) break;
  }
  return out;
}

/** One person in a workspace. The API has no members route, so these are read from each user's own workspace list. */
export interface Member { id: string; email: string; fullName: string | null; role: string; createdAt: string }

export function membersOfWorkspace(users: AppUser[], workspaceId: string): Member[] {
  return users.flatMap((u) => {
    const w = u.workspaces.find((x) => x.id === workspaceId);
    return w ? [{ id: u.id, email: u.email, fullName: u.fullName, role: w.role, createdAt: u.createdAt }] : [];
  });
}

/** The owners found in the workspace list: the people we can name when the users route is not available. */
export function ownersOf(workspaces: Workspace[]): { key: string; email: string; fullName: string | null; workspaces: { name: string }[] }[] {
  const by = new Map<string, { key: string; email: string; fullName: string | null; workspaces: { name: string }[] }>();
  for (const w of workspaces) {
    if (!w.owner?.email) continue;
    const k = w.owner.email.toLowerCase();
    const cur = by.get(k) ?? { key: k, email: w.owner.email, fullName: w.owner.fullName, workspaces: [] };
    cur.workspaces.push({ name: w.name });
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export const listWhitelist = async () => parse(z.array(whitelistEntrySchema).catch([]), await request('GET', '/whitelist'));

export const addWhitelist = async (body: { email: string; plan: string; note?: string; seats?: number }) => parse(addResultSchema, await request('POST', '/whitelist', body));

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
  const org = e.DONEXEL_POLAR_ORG_SLUG ?? e.DISCONOTIFY_POLAR_ORG_SLUG;
  return polarDashboardUrl(polarSandbox('donexel'), org, org ? '/sales' : '');
}

/** Plain-language reason for a failed call, safe to show to an admin. */
export function describe(e: unknown): string {
  if (!(e instanceof TmsError)) return 'Could not load data from Donexel.';
  if (e.code === 'not_configured') return 'The Donexel connection is not set up. Add DONEXEL_API_URL and DONEXEL_ADMIN_KEY to the environment and redeploy.';
  if (e.status === 401) return 'The Donexel rejected the admin key (wrong, missing or changed).';
  if (e.status === 404 && /application not found/i.test(e.message)) return 'The Donexel API address answered "Application not found". The Railway service is not deployed at that domain, or the domain in DONEXEL_API_URL is wrong.';
  if (e.status === 404) return 'The Donexel operator API answered 404. Its ADMIN_API_KEY is probably not set, or DONEXEL_API_URL is wrong.';
  if (e.status === 429) return 'The Donexel rate limit was reached (120 requests per minute). Try again shortly.';
  if (e.code === 'unreachable') return 'Could not reach the Donexel API.';
  if (e.code === 'bad_response') return 'The Donexel API sent a response this panel could not read.';
  return 'The Donexel API returned an error.';
}
