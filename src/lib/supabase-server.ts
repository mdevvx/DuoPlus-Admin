import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';
import { bigIntSafeFetch } from './bigjson';

// The data schemas are runtime-defined (introspected), so the client is loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

/**
 * Service-role client for a given Postgres schema. SERVER ONLY: it bypasses RLS.
 * Call it only after requireAdmin().
 */
export function serviceClient(schema: string): Db {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'duoplus-admin' }, fetch: bigIntSafeFetch },
  });
}
/** Postgres schema holding the hub's own tables and mutation functions. */
export const HUB_SCHEMA = 'duolplus_admin';
export const hubDb = () => serviceClient(HUB_SCHEMA);

/** Cookie-bound anon client used for the Supabase Auth flow (OTP, MFA, session reads). */
export async function authClient(): Promise<Db> {
  const e = env();
  const jar = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            jar.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
          }
        } catch {
          /* called from a Server Component: middleware refreshes the session instead */
        }
      },
    },
  });
}

/** Throw on PostgREST errors with a message that never includes row data. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data as T;
}
