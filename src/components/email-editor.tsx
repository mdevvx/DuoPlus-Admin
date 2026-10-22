'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertTriangle, Info, Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import { previewEmail, saveTemplate, sendTest, type PreviewResult } from '@/products/disconotify/email-actions';
import { hasErrors, validateTemplate } from '@/products/disconotify/email/validate';
import { htmlToText } from '@/products/disconotify/email/render';
import { PREHEADER_MAX, SAMPLES, SUBJECT_MAX, VARIABLES } from '@/products/disconotify/email/vars';
import { useToast } from './toast';

type Field = 'subject' | 'preheader' | 'html' | 'text';
interface Props {
  tplKey: string; version: number; category: string; builtIn: boolean; canEdit: boolean;
  initial: { name: string; description: string; subject: string; preheader: string; html: string; text: string };
}

const label = 'mb-1.5 block text-[13px] font-medium';
const draftKey = (k: string, v: number) => `email-draft:${k}:${v}`;

export function EmailEditor({ tplKey, version, category, canEdit, initial }: Props) {
  const [v, setV] = useState(initial);
  const [tab, setTab] = useState<'html' | 'text'>('html');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [dark, setDark] = useState(false);
  const [sample, setSample] = useState('normal');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof initial | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const focus = useRef<Field>('html');
  const refs = { subject: useRef<HTMLInputElement>(null), preheader: useRef<HTMLInputElement>(null), html: useRef<HTMLTextAreaElement>(null), text: useRef<HTMLTextAreaElement>(null) };
  const toast = useToast();
  const router = useRouter();

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const issues = validateTemplate({ ...v, category });

  // A draft from an earlier session is offered once, never applied silently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(tplKey, version));
      if (raw) { const d = JSON.parse(raw) as typeof initial; if (JSON.stringify(d) !== JSON.stringify(initial)) setDraft(d); }
    } catch { /* storage unavailable */ }
  }, [tplKey, version, initial]);
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(draftKey(tplKey, version), JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [v, dirty, tplKey, version]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Debounced server render: same sanitizer and layout as the real send.
  useEffect(() => {
    const t = setTimeout(() => {
      void previewEmail({ subject: v.subject, preheader: v.preheader, html: v.html, text: v.text, category, sample, dark }).then(setPreview);
    }, 400);
    return () => clearTimeout(t);
  }, [v.subject, v.preheader, v.html, v.text, category, sample, dark]);

  const set = (f: Field, value: string) => setV((s) => ({ ...s, [f]: value }));

  const insert = useCallback((snippet: string) => {
    const f = focus.current;
    const el = refs[f].current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + snippet + el.value.slice(end);
    setV((s) => ({ ...s, [f]: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + snippet.length, start + snippet.length); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    setError(null);
    start(async () => {
      const res = await saveTemplate({ key: tplKey, version, category, ...v });
      if (res.ok) {
        try { localStorage.removeItem(draftKey(tplKey, version)); } catch { /* storage unavailable */ }
        toast(true, res.message);
        router.refresh();
      } else setError(res.error);
    });
  }

  function test() {
    startTest(async () => {
      const res = await sendTest({ key: tplKey, subject: v.subject, html: v.html, text: v.text, category, sample });
      toast(res.ok, res.ok ? res.message : res.error);
    });
  }

  const subjectLen = v.subject.length;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        {draft && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft px-4 py-3 text-[13px]">
            <span>You have an unsaved draft of this template from earlier.</span>
            <span className="flex gap-2">
              <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => { setV(draft); setDraft(null); }}>Restore draft</button>
              <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => { try { localStorage.removeItem(draftKey(tplKey, version)); } catch { /* ignore */ } setDraft(null); }}>Discard</button>
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Name</span>
            <input className="input" value={v.name} maxLength={80} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
          <label className="block"><span className={label}>Description <span className="font-normal text-muted">· internal</span></span>
            <input className="input" value={v.description} maxLength={300} disabled={!canEdit} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        </div>

        <label className="block">
          <span className={label}>Subject</span>
          <input ref={refs.subject} className="input" value={v.subject} disabled={!canEdit} onFocus={() => (focus.current = 'subject')} onChange={(e) => set('subject', e.target.value)} />
          <span className={clsx('mt-1 block text-right text-[12px]', subjectLen > SUBJECT_MAX ? 'text-danger' : subjectLen > 60 ? 'text-warning' : 'text-muted')}>
            {subjectLen}/{SUBJECT_MAX}{subjectLen > 60 && subjectLen <= SUBJECT_MAX ? ' · inboxes cut around 60' : ''}
          </span>
        </label>
        <label className="block">
          <span className={label}>Preheader <span className="font-normal text-muted">· the grey preview line next to the subject</span></span>
          <input ref={refs.preheader} className="input" value={v.preheader} disabled={!canEdit} onFocus={() => (focus.current = 'preheader')} onChange={(e) => set('preheader', e.target.value)} />
          <span className="mt-1 block text-right text-[12px] text-muted">{v.preheader.length}/{PREHEADER_MAX}</span>
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <div role="tablist" aria-label="Body" className="flex gap-1">
              {(['html', 'text'] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={clsx('rounded-md px-3 py-1 text-[13px] font-medium', tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle')}>{t === 'html' ? 'HTML body' : 'Plain text'}</button>
              ))}
            </div>
            {tab === 'text' && canEdit && <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => set('text', htmlToText(v.html))}>Generate from HTML</button>}
          </div>
          <textarea ref={refs.html} hidden={tab !== 'html'} className="input h-80 resize-y py-2 font-mono text-[12.5px] leading-5" spellCheck={false} value={v.html} disabled={!canEdit}
            onFocus={() => (focus.current = 'html')} onChange={(e) => set('html', e.target.value)} aria-label="HTML body" />
          <textarea ref={refs.text} hidden={tab !== 'text'} className="input h-80 resize-y py-2 font-mono text-[12.5px] leading-5" spellCheck={false} value={v.text} disabled={!canEdit}
            onFocus={() => (focus.current = 'text')} onChange={(e) => set('text', e.target.value)} aria-label="Plain-text body" />
          <p className="mt-1 text-[12px] text-muted">Write the body only. The shared layout adds the header, footer and unsubscribe link. <code>{'{{name}}'}</code> is escaped; <code>{'{{{x_url}}}'}</code> is for links only.</p>
        </div>

        {canEdit && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Insert variable</div>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((x) => (
                <button key={x.name} type="button" title={`${x.meaning} (e.g. ${x.sample})`} className="rounded-md border border-line bg-subtle px-2 py-1 font-mono text-[12px] hover:bg-accent-soft"
                  onClick={() => insert(x.url && focus.current === 'html' ? `{{{${x.name}}}}` : `{{${x.name}}}`)}>{x.name}</button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.filter((x) => x.url && x.name !== 'unsubscribe_url').map((x) => (
                <button key={x.name} type="button" className="btn h-7 px-2.5 text-xs" onClick={() => { setTab('html'); focus.current = 'html'; insert(`<a href="{{{${x.name}}}}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#5B6CF0;color:#ffffff;text-decoration:none">Open link</a>`); }}>
                  + Button: {x.name.replace('_url', '')}</button>
              ))}
            </div>
          </div>
        )}

        {issues.length > 0 && (
          <ul aria-label="Problems" className="space-y-1.5">
            {issues.map((i, n) => (
              <li key={n} className={clsx('flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]', i.level === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                {i.level === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <span><b className="capitalize">{i.field}</b>{i.line ? ` line ${i.line}` : ''}: {i.message}</span>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
        {canEdit ? (
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={pending || !dirty || hasErrors(issues)} onClick={save}>{pending ? 'Saving…' : 'Save template'}</button>
            {dirty && <span className="text-[13px] text-muted">Unsaved changes</span>}
            {dirty && <button type="button" className="btn" onClick={() => setV(initial)}>Discard changes</button>}
          </div>
        ) : <p className="text-muted">Only admins can edit templates.</p>}
        <div className="flex items-center gap-3">
          <button type="button" className="btn" disabled={testing || hasErrors(issues)} onClick={test}>{testing ? 'Queuing…' : 'Send me a test'}</button>
          <span className="text-[12px] text-muted">Sends the content above, even unsaved, to your own address with the chosen sample data. Limit: 5 per 10 minutes.</span>
        </div>
      </div>

      <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" aria-label="Sample data" value={sample} onChange={(e) => setSample(e.target.value)}>
            {SAMPLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="flex rounded-lg border border-line" role="group" aria-label="Device">
            <button type="button" aria-pressed={device === 'desktop'} className={clsx('flex h-9 w-9 items-center justify-center rounded-l-lg', device === 'desktop' && 'bg-accent-soft text-accent')} onClick={() => setDevice('desktop')} aria-label="Desktop"><Monitor className="h-4 w-4" /></button>
            <button type="button" aria-pressed={device === 'mobile'} className={clsx('flex h-9 w-9 items-center justify-center rounded-r-lg', device === 'mobile' && 'bg-accent-soft text-accent')} onClick={() => setDevice('mobile')} aria-label="Mobile"><Smartphone className="h-4 w-4" /></button>
          </div>
          <button type="button" aria-pressed={dark} className="btn" onClick={() => setDark((d) => !d)}>{dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />} {dark ? 'Light' : 'Dark'}</button>
        </div>

        <div className="card p-3">
          <div className="text-[12px] text-muted">As seen in an inbox</div>
          <div className="mt-1 truncate text-sm font-semibold">{preview?.ok ? preview.subject || '(no subject)' : '…'}</div>
          <div className="truncate text-[13px] text-muted">{preview?.ok ? preview.preheader || '(no preheader)' : ''}</div>
        </div>

        {preview && !preview.ok && <p role="alert" className="text-danger">{preview.error}</p>}
        {preview?.ok && preview.adjusted && <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning" role="status">The sanitizer would change some of your HTML on save (for example scripts, event handlers or unsafe links). The preview shows the cleaned version.</p>}
        {tab === 'html' ? (
          <iframe title="Email preview" sandbox="" srcDoc={preview?.ok ? preview.document : ''} className="mx-auto block h-[640px] w-full rounded-xl border border-line bg-white transition-[max-width]" style={{ maxWidth: device === 'mobile' ? 375 : '100%' }} />
        ) : (
          <pre className="card h-[640px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12.5px]" aria-label="Plain-text preview">{preview?.ok ? preview.text : ''}</pre>
        )}
        <p className="text-[12px] text-muted">The preview renders on the server with the same escaping, layout and sanitizer as a real send, inside a sandboxed frame. Sample data only; “use a real server” comes later.</p>
      </div>
    </div>
  );
}
