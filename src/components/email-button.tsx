'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { MousePointerClick } from 'lucide-react';
import { buttonHtml, type ButtonStyle } from '@/products/disconotify/email/button';
import { contrastOnWhite } from '@/products/disconotify/email/render';
import { fieldLabel as label } from './form';
import { ModalHeader } from './modal-header';

const LINKS: [string, string][] = [
  ['subscribe_url', 'Subscribe page'],
  ['activate_url', 'Trial activation page'],
  ['manage_url', 'Manage or cancel page'],
];

/**
 * "Add button" dialog for email bodies: text, where it links, look and alignment, with a live preview.
 * The address is one of the site's link variables, or any https:// or mailto: address.
 */
export function EmailButtonPicker({ accent, onInsert }: { accent: string; onInsert: (html: string, text: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('Open link');
  const [target, setTarget] = useState('subscribe_url');
  const [custom, setCustom] = useState('');
  const [style, setStyle] = useState<ButtonStyle>('filled');
  const [color, setColor] = useState(accent);
  const [align, setAlign] = useState<'left' | 'center'>('center');
  const [alsoText, setAlsoText] = useState(true);

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
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}><MousePointerClick className="h-4 w-4" aria-hidden /> Add button</button>
      <dialog ref={ref} className="w-[520px] max-w-[92vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={MousePointerClick} title="Add a button" description="A clickable button that opens a link." onClose={() => ref.current?.close()} />
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

          <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} />
            <span>Also add the link to the plain-text version, for people who read text only.</span></label>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!ok} onClick={insert}>Insert button</button>
        </footer>
      </dialog>
    </>
  );
}
