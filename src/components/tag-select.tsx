'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import clsx from 'clsx';
import { applyFilters } from './filter-bar';
import { usePopupFit } from './popup-fit';

const split = (v?: string) => [...new Set((v ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft py-0.5 pl-2 pr-1 text-xs font-medium text-ink">
      {label}
      <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="rounded p-0.5 text-muted hover:bg-black/10 hover:text-ink" aria-label={`Remove ${label}`}><X className="h-3 w-3" aria-hidden /></button>
    </span>
  );
}

/** Keeps the tags in step with the URL (Reset, back button) and applies the filter as soon as they change. */
function useTags(value: string | undefined, keep: (v: string) => boolean = () => true) {
  const hidden = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<string[]>(() => split(value).filter(keep));
  const url = split(value).filter(keep).join(',');
  useEffect(() => { setTags(url ? url.split(',') : []); }, [url]);
  const commit = (next: string[]) => {
    flushSync(() => setTags(next)); // hidden input must hold the new value before the form is read
    applyFilters(hidden.current);
  };
  return { tags, commit, hidden };
}

/**
 * Pick several values from a fixed list. One comma-separated value is submitted under `name`; applies on every change.
 * With `single` it is a normal one-choice dropdown (an "All" row, a tick on the chosen row, closes when you pick).
 */
export function TagSelect({ name, label, value, options, single }: { name: string; label: string; value?: string; options: [string, string][]; single?: boolean }) {
  const choices = options.filter(([v]) => v !== '');
  const { tags, commit, hidden } = useTags(value, (v) => choices.some(([o]) => o === v));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = usePopupFit<HTMLUListElement>(open);
  const text = (v: string) => choices.find(([o]) => o === v)?.[1] ?? v;

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const toggle = (v: string) => commit(tags.includes(v) ? tags.filter((t) => t !== v) : [...tags, v]);
  const pick = (v: string) => { commit(v === '' || tags.includes(v) ? [] : [v]); setOpen(false); };

  return (
    <div className="relative" ref={box}>
      <input ref={hidden} type="hidden" name={name} value={tags.join(',')} />
      <div role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}
        className={clsx('input flex h-auto min-h-9 w-auto min-w-48 cursor-pointer flex-wrap items-center gap-1.5 py-1 pr-2', open && 'border-accent')}>
        <span className="text-xs text-muted">{label}</span>
        {tags.length === 0 ? <span className="text-ink">All</span>
          : single ? <span className="text-ink">{text(tags[0]!)}</span>
          : tags.map((t) => <Chip key={t} label={text(t)} onRemove={() => commit(tags.filter((x) => x !== t))} />)}
        <span className="ml-auto flex items-center gap-1 pl-2">
          {tags.length > 0 && <button type="button" className="rounded p-0.5 text-muted hover:text-ink" aria-label={`Clear ${label}`} onClick={(e) => { e.stopPropagation(); commit([]); }}><X className="h-3.5 w-3.5" aria-hidden /></button>}
          <ChevronDown className={clsx('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </div>
      {open && (
        <ul ref={list} role="listbox" aria-multiselectable={!single} className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {(single ? [['', 'All'] as [string, string], ...choices] : choices).map(([v, l]) => {
            const on = single && v === '' ? tags.length === 0 : tags.includes(v);
            return (
              <li key={v || 'all'} role="option" aria-selected={on}>
                <button type="button" onClick={() => (single ? pick(v) : toggle(v))} className={clsx('flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left hover:bg-subtle', single && on && 'bg-accent-soft font-medium')}>
                  {single ? <Check className={clsx('h-4 w-4 shrink-0', on ? 'text-accent' : 'opacity-0')} aria-hidden />
                    : <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line')}>{on && <Check className="h-3 w-3" aria-hidden />}</span>}
                  {l}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Free-text tags: type a value and press Enter or comma. One comma-separated value is submitted under `name`; applies on every change. */
export function TagInput({ name, value, placeholder, className = 'w-56' }: { name: string; value?: string; placeholder: string; className?: string }) {
  const { tags, commit, hidden } = useTags(value);
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    setDraft('');
    if (parts.length) commit([...new Set([...tags, ...parts])]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && draft === '' && tags.length) commit(tags.slice(0, -1));
  };
  return (
    <div className={clsx('input flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1', className)}>
      <input ref={hidden} type="hidden" name={name} value={tags.join(',')} />
      {tags.map((t) => <Chip key={t} label={t} onRemove={() => commit(tags.filter((x) => x !== t))} />)}
      {/* The draft is not a filter yet: stop its change events so typing does not auto-apply half a word. */}
      <input className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder={tags.length ? 'Add another…' : placeholder} aria-label={placeholder}
        value={draft} onChange={(e) => { e.stopPropagation(); setDraft(e.target.value); }} onKeyDown={onKey} onBlur={add} />
    </div>
  );
}
