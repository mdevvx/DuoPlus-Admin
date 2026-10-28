'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import clsx from 'clsx';
import { CalendarDays, X } from 'lucide-react';
import { Calendar, parseIso, toIso } from './calendar';
import { usePopupFit } from './popup-fit';

/**
 * Themed date picker that submits as a plain YYYY-MM-DD form value (works inside GET filter forms and plain forms).
 * Uses the same calendar as the filters, so every date picker in the panel looks the same.
 */
export function DateField({ name, defaultValue, placeholder = 'Select date', ariaLabel, onChange, minDate, maxDate }: {
  name: string; defaultValue?: string; placeholder?: string; ariaLabel?: string; onChange?: (v: string) => void; minDate?: string; maxDate?: string;
}) {
  const [value, setRaw] = useState(defaultValue ?? '');
  // Follow the URL (Clear all, back button); user picks apply the filter straight away.
  useEffect(() => { setRaw(defaultValue ?? ''); }, [defaultValue]);
  const setValue = (v: string) => { flushSync(() => setRaw(v)); onChange?.(v); };
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = usePopupFit<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const sel = parseIso(value);
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
        <div ref={pop} role="dialog" aria-label="Choose a date"
          className={clsx('absolute left-0 z-40 rounded-xl border border-line bg-raised p-3 shadow-pop', up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]')}>
          <Calendar value={value} min={minDate} max={maxDate} onPick={(iso) => { setValue(iso); setOpen(false); }} />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
            <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted hover:bg-subtle hover:text-ink" onClick={() => { setValue(''); setOpen(false); }}><X className="h-3.5 w-3.5" aria-hidden /> Clear</button>
            <button type="button" className="rounded-lg px-2 py-1 font-medium text-accent hover:bg-accent-soft" onClick={() => { setValue(toIso(new Date())); setOpen(false); }}>Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
