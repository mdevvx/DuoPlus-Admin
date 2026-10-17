'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { authClient, hubDb, serviceClient } from "@/lib/supabase-server";
import { env } from '@/lib/env';
import { requestMeta, sha256 } from '@/lib/request';
import { isLocked, recordAttempt } from '@/lib/ratelimit';
import { writeAuditQuiet } from '@/lib/audit';
import { getAdmin, getPendingAdmin, getSession, stampStepUp, verifyTotp } from '@/lib/auth';
import { signStamp } from '@/lib/signed';
import { COOKIE, cookieOpts } from '@/lib/session-policy';
import { email as emailSchema, otp6 } from '@/lib/validation';

export interface FormState {
  error?: string;
  qr?: string;
  secret?: string;
  factorId?: string;
  recoveryCodes?: string[];
}

const BAD_LOGIN = 'Email or password is incorrect.';

async function allowlisted(email: string): Promise<{ id: string } | null> {
  const { data } = await hubDb().from('hub_admins').select('id').eq('email', email).eq('active', true).maybeSingle();
  return data ?? null;
}

/**
 * First-run bootstrap (replaces a manual seed): while no admin exists at all, a correct password for
 * INITIAL_OWNER_EMAIL creates the first owner. Once any admin exists this never triggers again.
 */
async function bootstrapOwner(userId: string, email: string): Promise<boolean> {
  const initial = env().INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  if (!initial || initial !== email) return false;
  const db = hubDb();
  const { count, error } = await db.from('hub_admins').select('id', { count: 'exact', head: true });
  if (error || (count ?? 1) > 0) return false;
  const ins = await db.from('hub_admins').insert({ id: userId, email, role: 'owner', active: true });
  if (ins.error) return false;
  await writeAuditQuiet({ admin_id: userId, admin_email: email, action: 'admin.bootstrap_owner' });
  return true;
}

/** Email + password. The allowlist is checked after the password; every failure gets the same message. */
export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  const em = emailSchema.safeParse(form.get('email'));
  const pw = z.string().min(1).max(200).safeParse(form.get('password'));
  if (!em.success || !pw.success) return { error: BAD_LOGIN };
  const email = em.data;
  const { ip } = await requestMeta();
  const subject = sha256(email);
  if (await isLocked(ip, subject)) return { error: 'Too many attempts. Try again in 15 minutes.' };

  const sb = await authClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw.data });
  let admin = !error && data.user ? await allowlisted(email) : null;
  if (!admin && !error && data.user && (await bootstrapOwner(data.user.id, email))) admin = { id: data.user.id };
  const ok = !!admin && data.user?.id === admin.id;
  await recordAttempt('code', ip, subject, ok);
  if (!ok || !admin) {
    if (data?.session) await sb.auth.signOut(); // valid Supabase account but not an allowed admin
    await writeAuditQuiet({ admin_email: admin ? email : null, action: 'auth.failure', target_type: 'email_hash', target_id: subject.slice(0, 16), reason: error ? 'bad credentials' : 'not allowlisted' });
    return { error: BAD_LOGIN };
  }
  await hubDb().from('hub_admins').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id);
  redirect('/mfa');
}

// ---------------------------------------------------------------------------
// Second factor
// ---------------------------------------------------------------------------

async function beginSession(userId: string) {
  const jar = await cookies();
  const secret = env().SESSION_SECRET;
  jar.set(COOKIE.started, await signStamp(secret, 'started', userId), { ...cookieOpts, maxAge: 60 * 60 * 9 });
  jar.set(COOKIE.active, await signStamp(secret, 'active', userId), { ...cookieOpts, maxAge: 60 * 60 * 9 });
  await stampStepUp(userId);
}

export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const admin = await getPendingAdmin();
  if (!admin) redirect('/login');
  const code = otp6.safeParse(form.get('code'));
  if (!code.success) return { error: 'Enter the 6-digit code.' };
  const res = await verifyTotp(code.data);
  if (!res.ok) return { error: res.error };
  await beginSession(admin.id);
  await writeAuditQuiet({ admin_id: admin.id, admin_email: admin.email, action: 'auth.signin' });
  redirect('/');
}

export async function startEnrollment(): Promise<FormState> {
  const admin = await getPendingAdmin();
  if (!admin) return { error: 'Session expired. Sign in again.' };
  const sb = await authClient();
  const existing = await sb.auth.mfa.listFactors();
  if (existing.data?.totp.some((f) => f.status === 'verified')) return { error: 'An authenticator is already enrolled.' };
  for (const f of existing.data?.all ?? []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'DuoPlus Admin', issuer: 'DuoPlus Admin' });
  if (error || !data) return { error: 'Could not start enrolment. Try again.' };
  // Supabase returns raw SVG markup (sometimes with a data: prefix); re-encode it as a valid data URI.
  const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;(?:charset=)?utf-8,/i, '');
  const qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return { factorId: data.id, qr, secret: data.totp.secret };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hashRecovery = (code: string) => createHmac('sha256', env().SESSION_SECRET).update(code.replace(/-/g, '').toUpperCase()).digest('hex');
function newRecoveryCode() {
  const b = randomBytes(10);
  const s = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export async function confirmEnrollment(_: FormState, form: FormData): Promise<FormState> {
  const admin = await getPendingAdmin();
  if (!admin) redirect('/login');
  const factorId = z.uuid().safeParse(form.get('factorId'));
  const code = otp6.safeParse(form.get('code'));
  if (!factorId.success || !code.success) return { error: 'Enter the 6-digit code from your app.', factorId: String(form.get('factorId') ?? '') };

  const { ip } = await requestMeta();
  const subject = sha256(admin.id);
  if (await isLocked(ip, subject)) return { error: 'Too many attempts. Try again in 15 minutes.' };
  const sb = await authClient();
  const ch = await sb.auth.mfa.challenge({ factorId: factorId.data });
  const ver = ch.data ? await sb.auth.mfa.verify({ factorId: factorId.data, challengeId: ch.data.id, code: code.data }) : { error: ch.error };
  await recordAttempt('mfa', ip, subject, !ver.error);
  if (ver.error) return { error: 'That code is not valid.', factorId: factorId.data };

  // 8 one-time recovery codes; only HMACs are stored. Shown exactly once.
  const codes = Array.from({ length: 8 }, newRecoveryCode);
  const db = hubDb();
  await db.from('hub_recovery_codes').delete().eq('admin_id', admin.id);
  await db.from('hub_recovery_codes').insert(codes.map((c) => ({ admin_id: admin.id, code_hash: hashRecovery(c) })));
  await beginSession(admin.id);
  await writeAuditQuiet({ admin_id: admin.id, admin_email: admin.email, action: 'auth.mfa_enrolled' });
  await writeAuditQuiet({ admin_id: admin.id, admin_email: admin.email, action: 'auth.signin' });
  return { recoveryCodes: codes };
}

/** Lost authenticator: a recovery code removes the old factor so a new one can be enrolled. */
export async function redeemRecoveryCode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await getPendingAdmin();
  if (!admin) redirect('/login');
  const raw = z.string().trim().min(8).max(20).safeParse(form.get('recovery'));
  if (!raw.success) return { error: 'Enter a recovery code.' };
  const { ip } = await requestMeta();
  const subject = sha256(admin.id);
  if (await isLocked(ip, subject)) return { error: 'Too many attempts. Try again in 15 minutes.' };

  const db = hubDb();
  const { data: row } = await db.from('hub_recovery_codes').select('id').eq('admin_id', admin.id)
    .eq('code_hash', hashRecovery(raw.data)).is('used_at', null).maybeSingle();
  await recordAttempt('recovery', ip, subject, !!row);
  if (!row) {
    await writeAuditQuiet({ admin_id: admin.id, admin_email: admin.email, action: 'auth.recovery_failure' });
    return { error: 'That recovery code is not valid.' };
  }
  await db.from('hub_recovery_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  const svc = serviceClient("public");
  const factors = await svc.auth.admin.mfa.listFactors({ userId: admin.id });
  for (const f of factors.data?.factors ?? []) await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId: admin.id });
  await db.from('hub_recovery_codes').delete().eq('admin_id', admin.id);
  await writeAuditQuiet({ admin_id: admin.id, admin_email: admin.email, action: 'auth.recovery_used', reason: 'authenticator reset' });
  redirect('/mfa');
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

async function signOut(everywhere: boolean) {
  const s = await getSession();
  const admin = await getAdmin();
  const sb = await authClient();
  await sb.auth.signOut({ scope: everywhere ? 'global' : 'local' });
  const jar = await cookies();
  for (const n of [COOKIE.started, COOKIE.active, COOKIE.stepup]) jar.delete(n);
  if (s) await writeAuditQuiet({ admin_id: s.user.id, admin_email: admin?.email ?? s.user.email, action: everywhere ? 'auth.signout_everywhere' : 'auth.signout' });
  redirect('/login');
}
export async function signOutAction() { await signOut(false); }
export async function signOutEverywhereAction() { await signOut(true); }
