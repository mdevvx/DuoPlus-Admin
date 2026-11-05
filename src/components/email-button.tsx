'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, MousePointerClick, Pencil, Trash2 } from 'lucide-react';
import { buttonHtml, type ButtonStyle } from '@/products/disconotify/email/button';
import { listButtons, moveBlock, removeBlock, replaceBlock, type ButtonSpec } from '@/products/disconotify/email/blocks';
import { contrastOnWhite } from '@/products/disconotify/email/render';
import { fieldLabel as label } from './form';
import { ModalHeader } from './modal-header';

const LINKS: [string, string][] = [
  ['subscribe_url', 'Billing page (subscribe)'],
  ['manage_url', 'Billing page (manage or cancel)'],
];

/**
 * "Add button" dialog for email bodies: text, where it links, look and alignment, with a live preview.
 * The address is one of the site's link variables, or any https:// or mailto: address.
 */
export function EmailButtonPicker({ accent, onInsert, initial }: { accent: string; onInsert: (html: string, text: string) => void; /** Set to edit an existing button. */ initial?: ButtonSpec }) {
  const ref = useRef<HTMLDialogElement>(null);
  const editing = !!initial;
  const known = initial ? /^\{\{\{(\w+)\}\}\}$/.exec(initial.href)?.[1] : undefined;
  const [text, setText] = useState(initial?.text ?? 'Open link');
  const [target, setTarget] = useState(initial ? (known && LINKS.some(([v]) => v === known) ? known : 'custom') : 'subscribe_url');
  const [custom, setCustom] = useState(initial && !known ? initial.href : '');
  const [style, setStyle] = useState<ButtonStyle>(initial?.style ?? 'filled');
  const [color, setColor] = useState(initial?.color ?? accent);
  const [align, setAlign] = useState<'left' | 'center'>(initial?.align ?? 'center');
  const [alsoText, setAlsoText] = useState(!editing);

  const isCustom = target === 'custom';
  const href = isCustom ? custom.trim() : `{{{${target}}}}`;
  const hrefOk = !isCustom || /^(https:\/\/|mailto:)[^\s"'<>]+$/i.test(href);
  const textOk = text.trim().length > 0 && text.length <= 40;
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(color);
  const ok = hrefOk && textOk && colorOk && (!isCustom || href.length > 0);
  const html = ok ? buttonHtml({ text: text.trim(), href, style, color, align }) : '';
  const on = colorOk && contrastOnWhite(color) >= 3 ? '#ffffff' : '#1b1b22';

  function insert() {
    if (!ok) return;
    onInsert(html, alsoText ? `${text.trim()}: ${href}` : '');
    ref.current?.close();
  }

  return (
    <>
      {editing
        ? <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => ref.current?.showModal()}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
        : <button type="button" className="btn" onClick={() => ref.current?.showModal()}><MousePointerClick className="h-4 w-4" aria-hidden /> Add button</button>}
      <dialog ref={ref} className="w-[520px] max-w-[92vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={MousePointerClick} title={editing ? 'Edit button' : 'Add a button'} description="A clickable button that opens a link." onClose={() => ref.current?.close()} />
        <div className="space-y-4 px-5 py-5">
          <label className="block"><span className={label}>Button text</span>
            <input className="input" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} aria-invalid={!textOk} /></label>

          <label className="block"><span className={label}>Opens</span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              {LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              <option value="custom">Another address…</option>
            </select></label>
          {isCustom && (
            <label className="block"><span className={label}>Address <span className="font-normal text-muted">· must start with https:// or mailto:</span></span>
              <input className={clsx('input', custom && !hrefOk && 'border-danger')} value={custom} placeholder="https://example.com/page" onChange={(e) => setCustom(e.target.value)} aria-invalid={!!custom && !hrefOk} />
              {custom && !hrefOk && <span role="alert" className="mt-1 block text-xs text-danger">Use a full https:// or mailto: address with no spaces.</span>}</label>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block"><span className={label}>Style</span>
              <select className="input" value={style} onChange={(e) => setStyle(e.target.value as ButtonStyle)}><option value="filled">Filled</option><option value="outline">Outline</option></select></label>
            <label className="block"><span className={label}>Position</span>
              <select className="input" value={align} onChange={(e) => setAlign(e.target.value as 'left' | 'center')}><option value="center">Centred</option><option value="left">Left</option></select></label>
            <div><span className={label}>Colour</span>
              <span className="flex items-center gap-2">
                <input aria-label="Pick colour" type="color" className="h-9 w-10 rounded border border-line bg-surface" value={colorOk ? color : accent} onChange={(e) => setColor(e.target.value)} />
                <input aria-label="Colour hex" className="input font-mono" value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} aria-invalid={!colorOk} />
              </span></div>
          </div>

          <div>
            <span className={label}>Preview</span>
            <div className={clsx('rounded-lg border border-line bg-white px-4 py-6', align === 'center' ? 'text-center' : 'text-left')}>
              <span className="inline-block rounded-lg px-[26px] py-3 text-base font-semibold"
                style={style === 'filled' ? { background: colorOk ? color : accent, color: on, border: `2px solid ${colorOk ? color : accent}` } : { color: colorOk ? color : accent, border: `2px solid ${colorOk ? color : accent}` }}>
                {text.trim() || 'Button'}
              </span>
            </div>
          </div>

          {!editing && (
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} />
              <span>Also add the link to the plain-text version, for people who read text only.</span></label>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!ok} onClick={insert}>{editing ? 'Save button' : 'Insert button'}</button>
        </footer>
      </dialog>
    </>
  );
}

/**
 * The buttons already in the body, in the order they appear, with controls to move each one up or down
 * past the other content, edit it, or remove it. The rest of the body is left exactly as written.
 */
export function EmailButtonList({ html, accent, onChange }: { html: string; accent: string; onChange: (html: string) => void }) {
  const buttons = listButtons(html);
  if (buttons.length === 0) return null;
  const icon = 'flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-muted hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Buttons in this email</div>
      <ul>
        {buttons.map((b) => (
          <li key={`${b.index}-${b.spec.text}-${b.spec.href}`} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{b.spec.text}</span>
              <span className="block truncate text-xs text-muted">{b.spec.href.replace(/^\{\{\{(\w+)\}\}\}$/, '$1')} · position {b.index + 1} of {b.count}</span>
            </span>
            <button type="button" className={icon} aria-label={`Move ${b.spec.text} up`} title="Move up" disabled={b.index === 0} onClick={() => onChange(moveBlock(html, b.index, -1))}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" className={icon} aria-label={`Move ${b.spec.text} down`} title="Move down" disabled={b.index === b.count - 1} onClick={() => onChange(moveBlock(html, b.index, 1))}><ArrowDown className="h-4 w-4" /></button>
            <EmailButtonPicker key={`${b.spec.text}${b.spec.href}${b.spec.color}${b.spec.style}${b.spec.align}`} accent={accent} initial={b.spec} onInsert={(block) => onChange(replaceBlock(html, b.index, block))} />
            <button type="button" className={`${icon} hover:text-danger`} aria-label={`Remove ${b.spec.text}`} title="Remove" onClick={() => onChange(removeBlock(html, b.index))}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
