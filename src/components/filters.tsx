'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListFilter, Loader2, Plus, RotateCcw, Search, Type, Hash, X } from 'lucide-react';
import { Calendar, parseIso, toIso } from './calendar';
import { usePopupFit } from './popup-fit';

type Opt = [value: string, label: string];
export type FilterField =
  /** Always-visible search box. */
  | { type: 'search'; key: string; label: string; placeholder: string; autoFocus?: boolean }
  /** One choice. `default` is what the page shows when the URL has no value. */
  | { type: 'select'; key: string; label: string; options: Opt[]; default?: string }
  /** Several choices, stored comma-separated. */
  | { type: 'multi'; key: string; label: string; options: Opt[] }
  | { type: 'text'; key: string; label: string; placeholder?: string; hint?: string }
  | { type: 'daterange'; key: string; label: string; fromKey: string; toKey: string }
  | { type: 'numrange'; key: string; label: string; minKey: string; maxKey: string; prefix?: string };

const owned = (f: FilterField) => (f.type === 'daterange' ? [f.fromKey, f.toKey] : f.type === 'numrange' ? [f.minKey, f.maxKey] : [f.key]);
const fmtDay = (iso: string) => { const p = parseIso(iso); return p ? new Date(p.y, p.m, p.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : iso; };
const csv = (v: string | null | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const FIELD_ICON = { select: ListFilter, multi: ListFilter, text: Type, daterange: CalendarDays, numrange: Hash, search: Search } as const;

const PRESETS: [string, () => [string, string]][] = [
  ['Today', () => { const t = toIso(new Date()); return [t, t]; }],
  ['Yesterday', () => { const d = new Date(Date.now() - 86400000); const t = toIso(d); return [t, t]; }],
  ['Last 7 days', () => [toIso(new Date(Date.now() - 6 * 86400000)), toIso(new Date())]],
  ['Last 30 days', () => [toIso(new Date(Date.now() - 29 * 86400000)), toIso(new Date())]],
  ['This month', () => { const n = new Date(); return [toIso(new Date(n.getFullYear(), n.getMonth(), 1)), toIso(n)]; }],
  ['Last month', () => { const n = new Date(); return [toIso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), toIso(new Date(n.getFullYear(), n.getMonth(), 0))]; }],
];

/**
 * The panel's filter bar. Pages only declare their fields; the bar reads and writes the URL, so filtered views stay
 * shareable and the back button works. A search box sits on the left, applied filters show as chips (click one to
 * edit it, × to remove it), and "Add filter" opens a searchable menu of the remaining fields. Press F to open it.
 */
export function Filters({ action, fields }: { action: string; fields: FilterField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const [pending, start] = useTransition();
  // The page re-renders on the server for every change, which takes a moment. Show the new filters at once and
  // let the URL catch up when the server answers (or snap back if it fails).
  const [optimistic, setOptimistic] = useOptimistic(urlParams.toString());
  const params = useMemo(() => new URLSearchParams(optimistic), [optimistic]);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FilterField | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const pop = usePopupFit<HTMLDivElement>(open);

  const get = (k: string) => params.get(k) ?? '';
  const search = fields.find((f): f is Extract<FilterField, { type: 'search' }> => f.type === 'search');
  const others = fields.filter((f) => f.type !== 'search');

  function apply(patch: Record<string, string | undefined>) {
    const qs = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '') qs.delete(k); else qs.set(k, v); }
    qs.delete('page'); // a new filter starts again from page 1
    const q = qs.toString();
    start(() => {
      setOptimistic(q);
      router.push(q ? `${action || pathname}?${q}` : action || pathname);
    });
  }

  // Which fields are applied, and how each one reads on its chip.
  const active = useMemo(() => others.flatMap((f) => {
    let text: string | null = null;
    if (f.type === 'select') { const v = get(f.key); if (v && v !== (f.default ?? '')) text = f.options.find(([o]) => o === v)?.[1] ?? v; }
    else if (f.type === 'multi') { const vs = csv(get(f.key)).map((v) => f.options.find(([o]) => o === v)?.[1] ?? v); if (vs.length) text = vs.length > 2 ? `${vs.slice(0, 2).join(', ')} +${vs.length - 2}` : vs.join(', '); }
    else if (f.type === 'text') { const v = get(f.key); if (v) text = v; }
    else if (f.type === 'daterange') { const a = get(f.fromKey); const b = get(f.toKey); if (a || b) text = a && b ? (a === b ? fmtDay(a) : `${fmtDay(a)} → ${fmtDay(b)}`) : a ? `from ${fmtDay(a)}` : `until ${fmtDay(b)}`; }
    else if (f.type === 'numrange') { const a = get(f.minKey); const b = get(f.maxKey); const p = f.prefix ?? ''; if (a || b) text = a && b ? `${p}${a} – ${p}${b}` : a ? `at least ${p}${a}` : `at most ${p}${b}`; }
    return text ? [{ f, text }] : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [params, fields]);

  const searching = !!search && !!get(search.key);
  const anyActive = active.length > 0 || searching;
  const reset = () => apply(Object.fromEntries(fields.flatMap(owned).map((k) => [k, undefined])));

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (field) setField(null); else setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, field]);

  // F opens the filter menu when you are not typing somewhere.
  useEffect(() => {
    if (others.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault(); setField(null); setMenuQuery(''); setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [others.length]);

  const edit = (f: FilterField) => { setField(f); setOpen(true); };
  const menu = others.filter((f) => f.label.toLowerCase().includes(menuQuery.trim().toLowerCase()));

  return (
    <div ref={box} className="relative mb-4">
      <div className="relative flex flex-wrap items-center gap-2 overflow-hidden rounded-xl border border-line bg-surface p-2.5 shadow-soft" aria-busy={pending}>
        {pending && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-accent-soft"><span className="block h-full w-1/3 animate-[filter-load_1s_ease-in-out_infinite] rounded bg-accent" /></span>}
        {search && <SearchBox field={search} value={get(search.key)} onApply={(v) => apply({ [search.key]: v })} />}

        {active.map(({ f, text }) => (
          <span key={f.key} className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-line bg-subtle text-sm">
            <button type="button" className="flex h-full items-center gap-1.5 pl-3 pr-2 hover:bg-raised" onClick={() => edit(f)} aria-label={`Edit filter ${f.label}`}>
              <span className="text-muted">{f.label}</span><span className="max-w-[220px] truncate font-medium">{text}</span>
            </button>
            <button type="button" className="flex h-full w-8 items-center justify-center text-muted hover:bg-raised hover:text-ink" aria-label={`Remove filter ${f.label}`} onClick={() => apply(Object.fromEntries(owned(f).map((k) => [k, undefined])))}><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}

        {others.length > 0 && (
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => { setField(null); setMenuQuery(''); setOpen(!open); }}
            className={clsx('inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent', open ? 'border-accent text-accent' : 'border-line')}>
            <Plus className="h-4 w-4" aria-hidden /> {active.length ? 'Add filter' : 'Filter'}<kbd className="ml-1 hidden rounded border border-line px-1 text-[10px] font-medium sm:inline">F</kbd>
          </button>
        )}

        <span className="ml-auto flex items-center gap-2">
          {pending && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating</span>}
          {anyActive && (
            <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
            </button>
          )}
        </span>
      </div>

      {open && (
        <div ref={pop} role="dialog" aria-label={field ? `Filter by ${field.label}` : 'Add a filter'} className="absolute left-2.5 top-[calc(100%+6px)] z-40 w-[312px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-raised shadow-pop">
          {!field ? (
            <div className="p-1.5">
              <div className="relative p-1.5">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input autoFocus className="input pl-9" placeholder="Filter by…" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && menu[0]) setField(menu[0]); }} aria-label="Search filters" />
              </div>
              <ul role="menu" className="max-h-72 overflow-y-auto">
                {menu.length === 0 && <li className="px-3 py-3 text-sm text-muted">No filter matches.</li>}
                {menu.map((f) => {
                  const Ico = FIELD_ICON[f.type];
                  const isOn = active.some((a) => a.f === f);
                  return (
                    <li key={f.key} role="none">
                      <button type="button" role="menuitem" onClick={() => setField(f)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-subtle">
                        <Ico className="h-4 w-4 text-muted" aria-hidden /> <span className="flex-1">{f.label}</span>
                        {isOn && <Check className="h-4 w-4 text-accent" aria-label="Applied" />}<ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Editor field={field} get={get} apply={apply} close={() => setOpen(false)} back={others.length > 1 || !active.some((a) => a.f === field) ? () => setField(null) : undefined} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchBox({ field, value, onApply }: { field: Extract<FilterField, { type: 'search' }>; value: string; onApply: (v: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setText(value); }, [value]); // follow the URL (Reset, back button)
  useEffect(() => () => clearTimeout(timer.current), []);
  const push = (v: string) => { clearTimeout(timer.current); if (v.trim() !== value) onApply(v.trim()); };
  return (
    <label className="relative block w-72 max-w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input className="input pl-9 pr-8" type="search" value={text} placeholder={field.placeholder} aria-label={field.label} autoFocus={field.autoFocus}
        onChange={(e) => { setText(e.target.value); clearTimeout(timer.current); timer.current = setTimeout(() => push(e.target.value), 300); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); push(text); } }} />
      {text && <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" onClick={() => { setText(''); push(''); }}><X className="h-3.5 w-3.5" /></button>}
    </label>
  );
}

function Shell({ title, back, children, footer }: { title: string; back?: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {back ? <button type="button" onClick={back} aria-label="Back to all filters" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink"><ChevronLeft className="h-4 w-4" /></button> : <span className="w-2" />}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="p-2">{children}</div>
      {footer && <div className="border-t border-line px-3 py-2">{footer}</div>}
    </div>
  );
}

function Editor({ field, get, apply, close, back }: { field: FilterField; get: (k: string) => string; apply: (p: Record<string, string | undefined>) => void; close: () => void; back?: () => void }) {
  if (field.type === 'select' || field.type === 'multi') return <Options field={field} get={get} apply={apply} close={close} back={back} />;
  if (field.type === 'daterange') return <Range field={field} get={get} apply={apply} close={close} back={back} />;
  if (field.type === 'numrange') return <Numbers field={field} get={get} apply={apply} close={close} back={back} />;
  if (field.type === 'text') return <TextValue field={field} get={get} apply={apply} close={close} back={back} />;
  return null;
}
type EditorProps<T extends FilterField> = { field: T; get: (k: string) => string; apply: (p: Record<string, string | undefined>) => void; close: () => void; back?: () => void };

function Options({ field, get, apply, close, back }: EditorProps<Extract<FilterField, { type: 'select' | 'multi' }>>) {
  const [q, setQ] = useState('');
  const multi = field.type === 'multi';
  const options = field.options.filter(([v]) => v !== '');
  const current = multi ? csv(get(field.key)) : [get(field.key) || (field.type === 'select' ? field.default ?? '' : '')];
  const shown = options.filter(([, l]) => l.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (v: string) => {
    if (multi) apply({ [field.key]: (current.includes(v) ? current.filter((x) => x !== v) : [...current, v]).join(',') });
    else { apply({ [field.key]: v === (field.type === 'select' ? field.default ?? '' : '') ? undefined : v }); close(); }
  };
  return (
    <Shell title={field.label} back={back} footer={multi && current.length > 0 ? <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => apply({ [field.key]: undefined })}>Clear selection</button> : undefined}>
      {options.length > 7 && <input autoFocus className="input mb-1.5" placeholder={`Search ${field.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${field.label}`} />}
      <ul role="listbox" aria-multiselectable={multi} className="max-h-64 overflow-y-auto">
        {shown.map(([v, l]) => {
          const on = current.includes(v);
          return (
            <li key={v} role="option" aria-selected={on}>
              <button type="button" onClick={() => pick(v)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-subtle', !multi && on && 'bg-accent-soft font-medium')}>
                {multi
                  ? <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line')}>{on && <Check className="h-3 w-3" aria-hidden />}</span>
                  : <Check className={clsx('h-4 w-4 shrink-0', on ? 'text-accent' : 'opacity-0')} aria-hidden />}
                <span className="flex-1">{l}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nothing matches.</li>}
      </ul>
    </Shell>
  );
}

function Range({ field, get, apply, close, back }: EditorProps<Extract<FilterField, { type: 'daterange' }>>) {
  const from = get(field.fromKey);
  const to = get(field.toKey);
  const [anchor, setAnchor] = useState<string | null>(null); // the first click of a range
  const pick = (iso: string) => {
    if (!anchor) { setAnchor(iso); return; }
    const [a, b] = anchor <= iso ? [anchor, iso] : [iso, anchor];
    apply({ [field.fromKey]: a, [field.toKey]: b });
    close();
  };
  return (
    <Shell title={field.label} back={back} footer={(from || to) ? <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => { apply({ [field.fromKey]: undefined, [field.toKey]: undefined }); close(); }}>Clear dates</button> : undefined}>
      <div className="flex flex-wrap gap-1.5 pb-2">
        {PRESETS.map(([l, range]) => (
          <button key={l} type="button" className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent"
            onClick={() => { const [a, b] = range(); apply({ [field.fromKey]: a, [field.toKey]: b }); close(); }}>{l}</button>
        ))}
      </div>
      <Calendar from={anchor ?? from} to={anchor ? undefined : to} onPick={pick} />
      <p className="px-1 pt-2 text-xs text-muted">{anchor ? 'Now pick the last day of the range.' : 'Pick the first day, then the last. Click the same day twice for one day.'}</p>
    </Shell>
  );
}

function Numbers({ field, get, apply, close, back }: EditorProps<Extract<FilterField, { type: 'numrange' }>>) {
  const [min, setMin] = useState(get(field.minKey));
  const [max, setMax] = useState(get(field.maxKey));
  const ok = (v: string) => v === '' || /^\d+(\.\d{1,2})?$/.test(v);
  const valid = ok(min) && ok(max) && !(min && max && Number(min) > Number(max));
  const submit = () => { if (valid) { apply({ [field.minKey]: min || undefined, [field.maxKey]: max || undefined }); close(); } };
  return (
    <Shell title={field.label} back={back} footer={<button type="button" className="btn btn-primary h-8 w-full" disabled={!valid} onClick={submit}>Apply</button>}>
      <div className="flex items-center gap-2" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}>
        <input autoFocus className="input" inputMode="decimal" placeholder={`Min ${field.prefix ?? ''}`.trim()} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum" aria-invalid={!ok(min)} />
        <span className="text-muted">to</span>
        <input className="input" inputMode="decimal" placeholder={`Max ${field.prefix ?? ''}`.trim()} value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum" aria-invalid={!ok(max)} />
      </div>
      {!valid && <p role="alert" className="px-1 pt-2 text-xs text-danger">Enter plain numbers, with the minimum not above the maximum.</p>}
    </Shell>
  );
}

function TextValue({ field, get, apply, close, back }: EditorProps<Extract<FilterField, { type: 'text' }>>) {
  const [v, setV] = useState(get(field.key));
  const submit = () => { apply({ [field.key]: v.trim() || undefined }); close(); };
  return (
    <Shell title={field.label} back={back} footer={<button type="button" className="btn btn-primary h-8 w-full" onClick={submit}>Apply</button>}>
      <input autoFocus className="input" value={v} placeholder={field.placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} aria-label={field.label} />
      {field.hint && <p className="px-1 pt-2 text-xs text-muted">{field.hint}</p>}
    </Shell>
  );
}
