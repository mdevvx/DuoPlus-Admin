'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: +m[1]!, m: +m[2]! - 1, d: +m[3]! } : null;
};
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Themed date picker that submits as a plain YYYY-MM-DD form value (works inside GET filter forms).
 * Replaces the browser's native picker so the calendar follows the light/dark theme.
 */
export function DateField({ name, defaultValue, placeholder = 'Select date', ariaLabel }: { name: string; defaultValue?: string; placeholder?: string; ariaLabel?: string }) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const today = new Date();
  const start = parse(value) ?? { y: today.getFullYear(), m: today.getMonth(), d: 1 };
  const [view, setView] = useState({ y: start.y, m: start.m });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i < first || i >= first + days ? null : i - first + 1));
  const sel = parse(value);
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const shift = (delta: number) => { const d = new Date(view.y, view.m + delta, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const label = sel ? new Date(sel.y, sel.m, sel.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      <button type="button" aria-label={ariaLabel ?? placeholder} aria-haspopup="dialog" aria-expanded={open}
        className={clsx('input flex w-40 items-center justify-between gap-2 text-left', !label && 'text-muted')} onClick={(e) => { setUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 340); setOpen(!open); }}>
        <span className="truncate">{label || placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose a date"
          className={clsx('absolute left-0 z-40 w-[288px] rounded-xl border border-line bg-raised p-3 shadow-pop', up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]')}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold">{monthName}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-semibold uppercase text-muted">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const iso = toIso(view.y, view.m, d);
              const isSel = value === iso;
              const isToday = iso === toIso(today.getFullYear(), today.getMonth(), today.getDate());
              return (
                <button key={i} type="button" aria-pressed={isSel} onClick={() => { setValue(iso); setOpen(false); }}
                  className={clsx('num h-8 rounded-lg text-[13px] transition-colors',
                    isSel ? 'bg-accent font-semibold text-accent-ink' : isToday ? 'bg-accent-soft font-semibold text-accent' : 'text-ink hover:bg-subtle')}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[13px]">
            <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted hover:bg-subtle hover:text-ink" onClick={() => { setValue(''); setOpen(false); }}><X className="h-3.5 w-3.5" aria-hidden /> Clear</button>
            <button type="button" className="rounded-lg px-2 py-1 font-medium text-accent hover:bg-accent-soft" onClick={() => { const t = new Date(); setValue(toIso(t.getFullYear(), t.getMonth(), t.getDate())); setView({ y: t.getFullYear(), m: t.getMonth() }); setOpen(false); }}>Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
