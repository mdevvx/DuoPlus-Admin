'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useTransition, type ChangeEvent, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

const FILTER_EVENT = 'filterchange';

/** Custom controls (tags, date picker) call this after updating their hidden input so the filters apply. */
export function applyFilters(el: Element | null | undefined) {
  el?.dispatchEvent(new CustomEvent(FILTER_EVENT, { bubbles: true }));
}

/**
 * Filters stay shareable URLs and apply as you change them (text is debounced), via client-side navigation
 * so the shell never reloads. There is no Apply button; "Clear" appears only while a filter is active.
 */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  const router = useRouter();
  const current = useSearchParams();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const submit = () => {
    if (!form.current) return;
    clearTimeout(timer.current);
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(form.current)) {
      if (typeof v === 'string' && v.trim() !== '') qs.set(k, v.trim());
    }
    const q = qs.toString();
    if (q === [...current.entries()].filter(([k]) => k !== 'page').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') && !current.get('page')) return;
    start(() => router.push(q ? `${action}?${q}` : action));
  };

  useEffect(() => {
    const el = form.current;
    el?.addEventListener(FILTER_EVENT, submit);
    return () => { el?.removeEventListener(FILTER_EVENT, submit); clearTimeout(timer.current); };
  });

  // Dropdowns apply at once; typing waits for a short pause.
  const onChange = (e: ChangeEvent<HTMLFormElement>) => {
    const t = e.target as unknown as HTMLInputElement;
    clearTimeout(timer.current);
    timer.current = setTimeout(submit, t.tagName === 'INPUT' && t.type !== 'checkbox' ? 450 : 0);
  };

  // Uncontrolled text boxes and dropdowns keep what was typed, so blank them along with the URL.
  const clear = () => {
    for (const el of Array.from(form.current?.elements ?? [])) {
      if (el instanceof HTMLInputElement && el.type !== 'hidden') el.value = '';
      else if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
    }
    start(() => router.push(action));
  };

  const active = [...current.keys()].some((k) => k !== 'page');

  return (
    <form ref={form} method="get" action={action} onChange={onChange} onSubmit={(e) => { e.preventDefault(); submit(); }} aria-busy={pending}
      className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-soft">
      {children}
      {pending && <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating…</span>}
      {active && (
        <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-muted hover:bg-subtle hover:text-ink" onClick={clear}>
          <X className="h-3.5 w-3.5" aria-hidden /> Clear all
        </button>
      )}
    </form>
  );
}
