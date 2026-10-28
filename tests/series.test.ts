import { describe, expect, it } from 'vitest';
import { dailyCounts, dailySums, lastDays, pct, windowTotals } from '@/products/team-management/series';

const NOW = Date.parse('2026-10-29T12:00:00Z');

describe('overview chart helpers', () => {
  it('lists the last days, oldest first, ending today', () => {
    const d = lastDays(3, NOW);
    expect(d).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
    expect(lastDays(30, NOW)).toHaveLength(30);
  });

  it('puts one point on every day and ignores items outside the window', () => {
    const s = dailySums([{ date: '2026-10-29T08:00:00Z', value: 5 }, { date: '2026-10-29T23:00:00Z', value: 2.5 }, { date: '2026-10-27', value: 1 }, { date: '2026-09-01', value: 99 }, { date: '2026-10-28', value: Number.NaN }], 3, NOW);
    expect(s).toEqual([{ day: '2026-10-27', value: 1 }, { day: '2026-10-28', value: 0 }, { day: '2026-10-29', value: 7.5 }]);
  });

  it('counts items per day', () => {
    expect(dailyCounts(['2026-10-29T01:00:00Z', '2026-10-29T02:00:00Z', '2026-10-28T00:00:00Z'], 2, NOW)).toEqual([{ day: '2026-10-28', value: 1 }, { day: '2026-10-29', value: 2 }]);
  });

  it('compares this window with the one before it', () => {
    // 3-day windows ending on 2026-10-29: current = 27..29, previous = 24..26
    const items = [
      { date: '2026-10-29', value: 10 }, { date: '2026-10-27', value: 5 }, // current: 15
      { date: '2026-10-26', value: 4 }, { date: '2026-10-24', value: 2 },   // previous: 6
      { date: '2026-10-20', value: 100 },                                   // older: ignored
    ];
    expect(windowTotals(items, 3, NOW)).toEqual({ cur: 15, prev: 6 });
    expect(pct(15, 6)).toBeCloseTo(150);
    expect(pct(3, 6)).toBeCloseTo(-50);
    expect(pct(5, 0)).toBeNull();
  });
});
