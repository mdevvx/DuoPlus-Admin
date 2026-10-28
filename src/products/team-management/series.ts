/** Date helpers for the Overview charts. Pure, so they can be tested. All days are UTC. */
const DAY = 86_400_000;
const key = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The last `n` days ending today, oldest first, as YYYY-MM-DD. */
export function lastDays(n: number, now = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => key(now - (n - 1 - i) * DAY));
}

/** One point per day for the last `days` days. Items outside the window are ignored. */
export function dailySums(items: { date: string; value: number }[], days = 30, now = Date.now()): { day: string; value: number }[] {
  const out = new Map(lastDays(days, now).map((d) => [d, 0]));
  for (const it of items) {
    const d = it.date.slice(0, 10);
    if (out.has(d)) out.set(d, (out.get(d) ?? 0) + (Number.isFinite(it.value) ? it.value : 0));
  }
  return [...out].map(([day, value]) => ({ day, value }));
}

export const dailyCounts = (dates: string[], days = 30, now = Date.now()) => dailySums(dates.map((date) => ({ date, value: 1 })), days, now);

/** Total over the last `days` days and over the `days` before that, for the "up or down" arrow. */
export function windowTotals(items: { date: string; value: number }[], days = 30, now = Date.now()): { cur: number; prev: number } {
  const start = key(now - (days - 1) * DAY);
  const prevStart = key(now - (2 * days - 1) * DAY);
  let cur = 0, prev = 0;
  for (const it of items) {
    const d = it.date.slice(0, 10);
    const v = Number.isFinite(it.value) ? it.value : 0;
    if (d >= start) cur += v; else if (d >= prevStart) prev += v;
  }
  return { cur, prev };
}

/** Percent change, or null when there is nothing to compare with. */
export const pct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
