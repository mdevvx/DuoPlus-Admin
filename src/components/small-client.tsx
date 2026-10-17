'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Check, X } from 'lucide-react';

/** Discord IDs are strings; show them monospaced and copyable. */
export function CopyId({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="-ml-1 inline-flex items-center gap-1 rounded px-1 font-mono text-xs hover:bg-subtle"
      title="Copy ID"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
    >
      {value}
      {done ? <Check className="h-3 w-3 text-success" aria-label="Copied" /> : <Copy className="h-3 w-3 text-muted" aria-hidden />}
    </button>
  );
}

/** Arrow-key navigation between row links in any table marked data-keynav. */
export function TableKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const el = document.activeElement as HTMLElement | null;
      if (!el?.closest('table[data-keynav]')) return;
      const rows = Array.from(el.closest('table')!.querySelectorAll('tbody tr'));
      const idx = rows.findIndex((r) => r.contains(el));
      const next = rows[idx + (e.key === 'ArrowDown' ? 1 : -1)]?.querySelector<HTMLElement>('a[href]');
      if (next) { e.preventDefault(); next.focus(); }
    };
    // Click anywhere on a row to open it (unless the click was on a control or selected text).
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('a, button, input, select, textarea, label') || window.getSelection()?.toString()) return;
      const row = t.closest('table[data-keynav] tbody tr');
      row?.querySelector<HTMLAnchorElement>('a[data-row-link]')?.click();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);
  return null;
}

/** Right-hand side sheet for quick views. */
export function SideSheet({ trigger, title, children }: { trigger: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn h-6 px-2 text-xs" onClick={() => ref.current?.showModal()}>{trigger}</button>
      <dialog ref={ref} className="fixed inset-y-0 left-auto right-0 m-0 h-screen max-h-none w-[420px] max-w-none border-l border-line bg-raised p-0 text-ink shadow-pop backdrop:bg-black/30">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" className="btn h-7 w-7 p-0" aria-label="Close" onClick={() => ref.current?.close()}><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-auto p-4">{children}</div>
      </dialog>
    </>
  );
}

/** One-line text with the rest behind a "See more" popup. Keeps long values (errors, reasons) from breaking tables. */
export function ClampText({ text, title = 'Details', max = 64 }: { text: string; title?: string; max?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  if (text.length <= max) return <span>{text}</span>;
  return (
    <>
      <span className="inline-flex max-w-[340px] items-center gap-2 align-middle">
        <span className="truncate" title={text}>{text}</span>
        <button type="button" className="shrink-0 text-xs font-medium text-accent hover:underline" onClick={() => ref.current?.showModal()}>See more</button>
      </span>
      <dialog ref={ref} className="w-[520px] max-w-[90vw] rounded-xl border border-line bg-raised p-0 text-ink shadow-pop backdrop:bg-black/50" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" className="btn h-8 w-8 border-transparent bg-transparent p-0" aria-label="Close" onClick={() => ref.current?.close()}><X className="h-4 w-4" /></button>
        </div>
        <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-sm leading-6">{text}</p>
      </dialog>
    </>
  );
}
