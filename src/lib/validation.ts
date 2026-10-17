import { z } from 'zod';

/** Discord snowflakes stay strings end to end (they exceed Number.MAX_SAFE_INTEGER). */
export const snowflake = z.string().regex(/^\d{5,25}$/, 'Invalid ID');
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const reason = z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500);
export const otp6 = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const uuid = z.uuid();

/** Common URL list params: page, q, sort, dir plus any extra filters. */
export const listParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.string().max(40).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).catch('desc'),
});
export const PAGE_SIZE = 50;

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Flatten Next's searchParams into a single-valued record for zod. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, firstParam(v)]));
}

/** Escape a user search term for use inside a PostgREST `ilike` filter value. */
export function likeTerm(q: string): string {
  return q.replace(/[%_\\,()*]/g, (c) => `\\${c}`);
}
