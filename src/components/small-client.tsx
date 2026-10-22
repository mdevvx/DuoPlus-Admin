'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Check, FileText, Maximize2, Minimize2 } from 'lucide-react';
import clsx from 'clsx';
import { ModalHeader } from './modal-header';

/** Discord IDs are strings; show them monospaced and copyable. */
export function CopyId({ value, mono = true }: { value: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`-ml-1 inline-flex items-center gap-1 rounded px-1 text-left hover:bg-subtle ${mono ? 'num' : 'break-all'}`}
      title="Copy ID"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Copied" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
      <span>{value}</span>
    </button>
  );
}

async function copyToClipboard(value: string, done: (v: boolean) => void) {
  try { await navigator.clipboard.writeText(value); done(true); setTimeout(() => done(false), 1500); } catch { /* clipboard blocked */ }
}

/** Small icon button that copies a value. Used next to long text in detail dialogs. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={label} aria-label={label} onClick={() => copyToClipboard(value, setDone)}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-subtle hover:text-ink">
      {done ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/** Preformatted text (JSON, logs) that wraps, never scrolls sideways, and has a Copy button. */
export function CopyBlock({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative rounded-lg border border-line bg-subtle">
      <button type="button" onClick={() => copyToClipboard(text, setDone)}
        className="absolute right-2 top-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-xs font-medium hover:bg-raised">
        {done ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {done ? 'Copied' : label}
      </button>
      <pre className="whitespace-pre-wrap break-words px-3 py-3 pr-24 text-left font-mono text-[12.5px] leading-5 [overflow-wrap:anywhere]">{text}</pre>
    </div>
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
      // Dialogs are rendered inside rows; clicks in or on the backdrop of one must not open the row.
      if (t.closest('a, button, input, select, textarea, label, dialog') || window.getSelection()?.toString()) return;
      const row = t.closest('table[data-keynav] tbody tr');
      row?.querySelector<HTMLAnchorElement>('a[data-row-link]')?.click();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);
  return null;
}

/** Centered detail modal opened from a table row button. */
export function DetailModal({ trigger, title, children }: { trigger: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [wide, setWide] = useState(false);
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => ref.current?.showModal()}>{trigger}</button>
      <dialog ref={ref} className={clsx('max-w-[96vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px] transition-[width] duration-150', wide ? 'w-[1040px]' : 'w-[520px]')}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={FileText} title={title} onClose={() => ref.current?.close()}
          actions={<button type="button" aria-label={wide ? 'Make narrower' : 'Make wider'} title={wide ? 'Make narrower' : 'Make wider'} onClick={() => setWide(!wide)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink sm:flex">{wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>} />
        <div className="thin-scroll max-h-[65vh] overflow-y-auto overflow-x-hidden px-5 py-4">{children}</div>
        <footer className="flex justify-end border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button>
        </footer>
      </dialog>
    </>
  );
}

/** One-line text with the rest behind a "See more" popup. Keeps long values (errors, reasons) from breaking tables. */
export function ClampText({ text, title = 'Details', max = 64 }: { text: string; title?: string; max?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  if (text.length <= max) return <span>{text}</span>;
  return (
    <>
      <span className="inline-flex max-w-full items-center gap-2 align-middle">
        <span className="truncate" title={text}>{text}</span>
        <button type="button" className="shrink-0 text-xs font-medium text-accent hover:underline" onClick={() => ref.current?.showModal()}>See more</button>
      </span>
      <dialog ref={ref} className="w-[540px] max-w-[92vw] overflow-hidden rounded-xl text-left border border-line bg-raised p-0 text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={FileText} tone="warning" title={title} onClose={() => ref.current?.close()} />
        <p className="thin-scroll max-h-[55vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 text-[13.5px] leading-6">{text}</p>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}>
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button>
        </footer>
      </dialog>
    </>
  );
}
