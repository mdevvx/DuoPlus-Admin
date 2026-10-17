import 'server-only';
import { hubDb } from './supabase-server';
import { LOCK_MS, MAX_FAILURES } from './session-policy';

export type AttemptKind = 'request' | 'code' | 'mfa' | 'recovery';
const IP_LIMIT = MAX_FAILURES * 4; // an office/NAT may share one IP

/** True when this email-hash or IP has hit the failure limit in the last 15 minutes. */
export async function isLocked(ip: string, subjectHash: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCK_MS).toISOString();
  const db = hubDb();
  const [byEmail, byIp] = await Promise.all([
    db.from('hub_login_attempts').select('id', { count: 'exact', head: true }).eq('email_hash', subjectHash).eq('success', false).gte('at', since),
    db.from('hub_login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('at', since),
  ]);
  // Fail closed: if we cannot count, treat as locked.
  if (byEmail.error || byIp.error) return true;
  return (byEmail.count ?? 0) >= MAX_FAILURES || (byIp.count ?? 0) >= IP_LIMIT;
}

export async function recordAttempt(kind: AttemptKind, ip: string, subjectHash: string, success: boolean) {
  await hubDb().from('hub_login_attempts').insert({ kind, ip, email_hash: subjectHash, success });
}
