'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

const split = (v?: string) => [...new Set((v ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-ink">
      {label}
      <button type="button" onClick={onRemove} className="rounded text-muted hover:text-ink" aria-label={`Remove ${label}`}><X className="h-3 w-3" aria-hidden /></button>
    </span>
  );
}

/** Pick several values from a fixed list. Submits one comma-separated value under `name`. */
export function TagSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  const [picked, setPicked] = useState<string[]>(() => split(value).filter((v) => options.some(([o]) => o === v)));
  const text = (v: string) => options.find(([o]) => o === v)?.[1] ?? v;
  const left = options.filter(([o]) => o !== '' && !picked.includes(o));
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 text-muted">
      <span className="text-xs">{label}</span>
      <input type="hidden" name={name} value={picked.join(',')} />
      {picked.map((v) => <Chip key={v} label={text(v)} onRemove={() => setPicked(picked.filter((x) => x !== v))} />)}
      {left.length > 0 && (
        <select className="input w-auto pr-7" value="" aria-label={`Add ${label}`} onChange={(e) => e.target.value && setPicked([...picked, e.target.value])}>
          <option value="">{picked.length ? 'Add…' : 'All'}</option>
          {left.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </div>
  );
}

/** Free-text tags: type a value and press Enter or comma. Submits one comma-separated value under `name`. */
export function TagInput({ name, value, placeholder, className = 'w-56' }: { name: string; value?: string; placeholder: string; className?: string }) {
  const id = useId();
  const [tags, setTags] = useState<string[]>(() => split(value));
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) setTags([...new Set([...tags, ...parts])]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && draft === '' && tags.length) setTags(tags.slice(0, -1));
  };
  // A pending draft is included on submit so typing then pressing Apply still works.
  const all = [...new Set([...tags, ...draft.split(',').map((s) => s.trim()).filter(Boolean)])];
  return (
    <div className={`input flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1 ${className}`}>
      <input type="hidden" name={name} value={all.join(',')} />
      {tags.map((t) => <Chip key={t} label={t} onRemove={() => setTags(tags.filter((x) => x !== t))} />)}
      <input id={id} className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder={tags.length ? 'Add another…' : placeholder} aria-label={placeholder}
        value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={commit} />
    </div>
  );
}
