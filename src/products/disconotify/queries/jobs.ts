import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { pn, T, daysFrom, iso, must, type Row } from '../db';

export const jobParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  failed: z.enum(['1']).optional().catch(undefined),
  code: z.string().trim().regex(/^[a-z0-9_.-]{1,60}$/i).optional().catch(undefined),
  guild: snowflake.optional().catch(undefined),
});
export type JobParams = z.infer<typeof jobParams>;

/** The result code the bot wrote for a job. The free-text payload is never read here. */
export function jobCode(r: Row): string | null {
  const res = r.result;
  if (res && typeof res === 'object' && 'code' in res) {
    const c = String((res as { code: unknown }).code ?? '');
    return /^[a-z0-9_.-]{1,60}$/i.test(c) ? c : 'other';
  }
  return null;
}

const COLS = 'id,guild_id,requested_by,kind,status,result,created_at,finished_at';
export const isFailed = (r: Row) => r.status === 'failed';

export interface JobStats { total: number; perHour: number; failed: number; failureRate: number; p95Seconds: number | null; offlineLastHour: number; codes: string[] }

/** Counters over the last 24 hours (finished rows are deleted by the bot after a day). */
export async function jobStats(): Promise<JobStats> {
  const res = await pn().from(T.jobs).select('status,result,created_at,finished_at').gte('created_at', iso(daysFrom(-1))).limit(20000);
  const rows = (res.error ? [] : (res.data ?? [])) as Row[];
  const failed = rows.filter(isFailed).length;
  const secs = rows.filter((r) => r.finished_at).map((r) => (new Date(String(r.finished_at)).getTime() - new Date(String(r.created_at)).getTime()) / 1000).filter((n) => n >= 0).sort((a, b) => a - b);
  const hourAgo = Date.now() - 3600_000;
  return {
    total: rows.length, perHour: rows.length / 24, failed, failureRate: rows.length ? failed / rows.length : 0,
    p95Seconds: secs.length ? secs[Math.min(secs.length - 1, Math.ceil(secs.length * 0.95) - 1)]! : null,
    offlineLastHour: rows.filter((r) => jobCode(r) === 'bot_offline' && new Date(String(r.created_at)).getTime() > hourAgo).length,
    codes: [...new Set(rows.map(jobCode).filter((c): c is string => !!c))].sort(),
  };
}

export async function listJobs(p: JobParams): Promise<{ rows: Row[]; total: number }> {
  let q = pn().from(T.jobs).select(COLS, { count: 'exact' }).gte('created_at', iso(daysFrom(-1)));
  if (p.failed) q = q.eq('status', 'failed');
  if (p.code) q = q.eq('result->>code', p.code);
  if (p.guild) q = q.eq('guild_id', p.guild);
  const from = (p.page - 1) * PAGE_SIZE;
  const res = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: must(res, 'jobs') as Row[], total: res.count ?? 0 };
}

/** A burst of bot_offline means the bot is down. */
export const BOT_OFFLINE_BURST = 5;
