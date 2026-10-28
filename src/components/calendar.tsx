'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (v: string | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  return m ? { y: +m[1]!, m: +m[2]! - 1, d: +m[3]! } : null;
};
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * The panel's one month calendar (themed, Monday first). Used by the date field and by the date-range filter.
 * `from`/`to` paint a range band; `value` marks a single chosen day.
 */
export function Calendar({ value, from, to, min, max, onPick }: { value?: string; from?: string; to?: string; min?: string; max?: string; onPick: (iso: string) => void }) {
  const today = new Date();
  const start = parseIso(value) ?? parseIso(from) ?? { y: today.getFullYear(), m: today.getMonth(), d: 1 };
  const [view, setView] = useState({ y: start.y, m: start.m });
  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i < first || i >= first + days ? null : i - first + 1));
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const shift = (delta: number) => { const d = new Date(view.y, view.m + delta, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const todayIso = toIso(today);
  const lo = from && to ? (from <= to ? from : to) : from;
  const hi = from && to ? (from <= to ? to : from) : from;

  return (
    <div className="w-[272px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{monthName}</span>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-semibold uppercase text-muted">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const iso = toIso(new Date(view.y, view.m, d));
          const isEnd = iso === lo || iso === hi || iso === value;
          const inRange = !!lo && !!hi && iso > lo && iso < hi;
          const out = (!!min && iso < min) || (!!max && iso > max);
          return (
            <button key={i} type="button" disabled={out} aria-pressed={isEnd} onClick={() => onPick(iso)}
              className={clsx('num h-8 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-30',
                isEnd ? 'rounded-lg bg-accent font-semibold text-accent-ink' : inRange ? 'bg-accent-soft text-ink' : iso === todayIso ? 'rounded-lg font-semibold text-accent hover:bg-subtle' : 'rounded-lg text-ink hover:bg-subtle')}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
