import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authClient, hubDb } from './supabase-server';
import { env } from './env';
import { signStamp, readStamp } from './signed';
import { COOKIE, STEPUP_MS, cookieOpts } from './session-policy';
import { isLocked, recordAttempt } from './ratelimit';
import { requestMeta, sha256 } from './request';
import { writeAuditQuiet } from './audit';
import { can, DANGEROUS, isRole, roleForProduct, type AdminAccess, type Permission, type ProductRole, type Role } from './roles';

export type AuthErrorCode = 'unauthenticated' | 'forbidden' | 'stepup' | 'locked';
export class HubAuthError extends Error {
  constructor(public code: AuthErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface Admin extends AdminAccess {
  id: string;
  email: string;
  displayName: string | null;
  theme: 'system' | 'light' | 'dark';
}

/** The Supabase auth user for this request (validated against the Auth server) and its assurance level. */
export const getSession = cache(async () => {
  const sb = await authClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return { user: data.user, aal: aal.data?.currentLevel ?? null };
});

async function loadAdmin(userId: string, authEmail: string | undefined): Promise<Admin | null> {
  const db = hubDb();
  const { data: row } = await db.from('hub_admins').select('id,email,display_name,role,active,theme').eq('id', userId).maybeSingle();
  if (!row || !row.active || !isRole(row.role)) return null;
  if (authEmail && row.email !== authEmail.toLowerCase()) return null; // allowlist row must match the auth identity
  const { data: assigned } = await db.from('hub_admin_products').select('product_slug,role').eq('admin_id', userId);
  const products: Record<string, ProductRole> = {};
  for (const a of assigned ?? []) if (a.role === 'admin') products[a.product_slug] = a.role;
  const theme = row.theme === 'light' || row.theme === 'dark' ? row.theme : 'system';
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role as Role, products, theme };
}

/** Fully authenticated admin: allowlisted, active and aal2. Null otherwise. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const s = await getSession();
  if (!s || s.aal !== 'aal2') return null;
  return loadAdmin(s.user.id, s.user.email);
});

/** Allowlisted admin who has passed the email step but not MFA yet (used by /mfa only). */
export const getPendingAdmin = cache(async (): Promise<Admin | null> => {
  const s = await getSession();
  if (!s) return null;
  return loadAdmin(s.user.id, s.user.email);
});

export interface Authorized {
  admin: Admin;
  /** Effective role in the requested product (or the global role for hub-level checks). */
  role: Role;
}

/**
 * Server-side gate for every loader and action. Deny by default.
 *  - product: the admin must be assigned to it (owners always are)
 *  - permission: the effective role must meet the permission's minimum
 */
export async function requireAdmin(opts: { product?: string; permission?: Permission } = {}): Promise<Authorized> {
  const admin = await getAdmin();
  if (!admin) throw new HubAuthError('unauthenticated');
  const role = opts.product ? roleForProduct(admin, opts.product) : admin.role;
  if (!role) throw new HubAuthError('forbidden', 'No access to this product');
  if (opts.permission && !can(role, opts.permission)) throw new HubAuthError('forbidden', `Missing permission ${opts.permission}`);
  return { admin, role };
}

/** For Server Components: translate auth failures into redirects. */
export async function requirePage(opts: { product?: string; permission?: Permission } = {}): Promise<Authorized> {
  try {
    return await requireAdmin(opts);
  } catch (e) {
    if (e instanceof HubAuthError) redirect(e.code === 'unauthenticated' ? '/login' : '/?denied=1');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Second factor
// ---------------------------------------------------------------------------

export async function verifyTotp(code: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSession();
  if (!s) return { ok: false, error: 'Session expired. Sign in again.' };
  const { ip } = await requestMeta();
  const subject = sha256(s.user.id);
  if (await isLocked(ip, subject)) return { ok: false, error: 'Too many attempts. Try again in 15 minutes.' };

  const sb = await authClient();
  const factors = await sb.auth.mfa.listFactors();
  const factor = factors.data?.totp.find((f) => f.status === 'verified');
  if (!factor) return { ok: false, error: 'No authenticator is enrolled.' };
  const ch = await sb.auth.mfa.challenge({ factorId: factor.id });
  const ver = ch.data ? await sb.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code }) : { error: ch.error };
  const ok = !ver.error;
  await recordAttempt('mfa', ip, subject, ok);
  if (!ok) {
    await writeAuditQuiet({ admin_id: s.user.id, admin_email: s.user.email, action: 'auth.mfa_failure' });
    return { ok: false, error: 'That code is not valid.' };
  }
  await stampStepUp(s.user.id);
  return { ok: true };
}

export async function stampStepUp(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE.stepup, await signStamp(env().SESSION_SECRET, 'stepup', userId), { ...cookieOpts, maxAge: 60 * 60 * 8 });
}

export async function stepUpFresh(userId: string): Promise<boolean> {
  const jar = await cookies();
  const at = await readStamp(env().SESSION_SECRET, 'stepup', userId, jar.get(COOKIE.stepup)?.value);
  return at !== null && Date.now() - at <= STEPUP_MS;
}

/**
 * Dangerous actions: the MFA challenge must be < 10 minutes old. If it is stale, a fresh TOTP `code`
 * is verified here; otherwise a 'stepup' error tells the UI to ask for one.
 */
export async function ensureStepUp(admin: Admin, permission: Permission, code?: string) {
  if (!DANGEROUS.has(permission)) return;
  if (await stepUpFresh(admin.id)) return;
  if (!code) throw new HubAuthError('stepup', 'Confirm with your authenticator code');
  const res = await verifyTotp(code);
  if (!res.ok) throw new HubAuthError('stepup', res.error);
}
