import 'server-only';
import { ZodError } from 'zod';
import { HubAuthError } from './auth';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string; needsStepUp?: boolean; stepUpInvalid?: boolean };

/** Errors whose message is safe to show to the admin. */
export class UserError extends Error {}

/** Turn anything thrown inside a Server Action into a safe, structured result. */
export async function runAction(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    return { ok: true, message: await fn() };
  } catch (e) {
    if (e instanceof HubAuthError) {
      if (e.code === 'stepup') {
        // 'required' = just ask for the code (not an error); anything else = a code was sent and was wrong or locked
        const required = e.message === 'stepup' || e.message === 'Confirm with your authenticator code';
        return { ok: false, error: required ? 'Enter your authenticator code to continue.' : e.message, needsStepUp: true, stepUpInvalid: !required };
      }
      if (e.code === 'unauthenticated') return { ok: false, error: 'Your session has ended. Sign in again.' };
      return { ok: false, error: 'You do not have permission to do that.' };
    }
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Invalid input.' };
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error('action failed:', e instanceof Error ? e.message : 'unknown'); // no payloads in logs
    return { ok: false, error: 'Something went wrong. Nothing was changed.' };
  }
}

/** Call a hub.* SQL function (change + audit in one transaction). Maps `raise exception` text to a UserError. */
export async function callRpc(db: import('./supabase-server').Db, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (error.code === 'P0001') throw new UserError(error.message.replace(/^rate_limited:\s*/, ''));
    throw new Error(`${fn} failed: ${error.code}`);
  }
  return data;
}
