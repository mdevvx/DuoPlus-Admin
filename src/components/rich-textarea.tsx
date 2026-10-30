'use client';

import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Bold, Italic, Link2, List, Underline } from 'lucide-react';

/**
 * The one text editor for email bodies and footers, used by every product. A small toolbar over a normal textarea, so
 * the caller's ref, value, onChange and "insert a value" code keep working unchanged.
 * `html` wraps the selection in tags; `markdown` is Donexel's plain-text body: only **bold** and *italic* are rendered, so only those buttons show.
 */
type Mode = 'html' | 'markdown';
interface Mark { open: string; close: string; placeholder: string }
type Kind = 'bold' | 'italic' | 'underline' | 'link' | 'list';

const MARKS: Record<Mode, Record<Kind, Mark>> = {
  html: {
    bold: { open: '<strong>', close: '</strong>', placeholder: 'bold text' },
    italic: { open: '<em>', close: '</em>', placeholder: 'italic text' },
    underline: { open: '<u>', close: '</u>', placeholder: 'underlined text' },
    link: { open: '<a href="https://">', close: '</a>', placeholder: 'link text' },
    list: { open: '<ul>\n  <li>', close: '</li>\n</ul>', placeholder: 'item' },
  },
  markdown: {
    bold: { open: '**', close: '**', placeholder: 'bold text' },
    italic: { open: '*', close: '*', placeholder: 'italic text' },
    underline: { open: '', close: '', placeholder: '' },
    link: { open: '', close: '', placeholder: '' },
    list: { open: '', close: '', placeholder: '' },
  },
};

const TOOLS: { kind: Kind; label: string; Icon: typeof Bold; key?: string }[] = [
  { kind: 'bold', label: 'Bold', Icon: Bold, key: 'b' },
  { kind: 'italic', label: 'Italic', Icon: Italic, key: 'i' },
  { kind: 'underline', label: 'Underline', Icon: Underline, key: 'u' },
  { kind: 'link', label: 'Link', Icon: Link2, key: 'k' },
  { kind: 'list', label: 'Bulleted list', Icon: List },
];

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { mode: Mode; value: string };

/** Writes through the native setter and fires an input event, so React's onChange sees the edit like typing. */
function setValue(el: HTMLTextAreaElement, next: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const RichTextarea = forwardRef<HTMLTextAreaElement, Props>(function RichTextarea({ mode, className, disabled, hidden, ...rest }, outer) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);
  const tools = TOOLS.filter((t) => MARKS[mode][t.kind].open !== '' || MARKS[mode][t.kind].close !== '');

  function apply(kind: Kind) {
    const el = ref.current;
    if (!el || disabled) return;
    const m = MARKS[mode][kind];
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    const picked = el.value.slice(s, e);
    const text = picked || m.placeholder;
    // Pressing the same mark again over an already wrapped selection removes it.
    const before = el.value.slice(Math.max(0, s - m.open.length), s);
    const after = el.value.slice(e, e + m.close.length);
    const wrapped = !!picked && m.close !== '' && kind !== 'link' && before === m.open && after === m.close;
    const next = wrapped
      ? el.value.slice(0, s - m.open.length) + picked + el.value.slice(e + m.close.length)
      : el.value.slice(0, s) + m.open + text + m.close + el.value.slice(e);
    setValue(el, next);
    const from = (wrapped ? s - m.open.length : s + m.open.length);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, from + text.length); });
  }

  return (
    <div hidden={hidden} className={clsx('rounded-lg border border-line bg-surface focus-within:border-accent', disabled && 'opacity-70')}>
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        {tools.map(({ kind, label, Icon, key }) => (
          <button key={kind} type="button" disabled={disabled} title={key ? `${label} (Ctrl+${key.toUpperCase()})` : label} aria-label={label}
            onMouseDown={(ev) => ev.preventDefault()} onClick={() => apply(kind)}
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-subtle hover:text-ink disabled:pointer-events-none"><Icon className="h-4 w-4" aria-hidden /></button>
        ))}
      </div>
      <textarea {...rest} ref={ref} disabled={disabled} className={clsx('block w-full resize-y rounded-b-lg border-0 bg-transparent px-3 py-2 outline-none', className)}
        onKeyDown={(ev) => {
          rest.onKeyDown?.(ev);
          if (ev.defaultPrevented || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
          const t = tools.find((x) => x.key === ev.key.toLowerCase());
          if (t) { ev.preventDefault(); apply(t.kind); }
        }} />
    </div>
  );
});
