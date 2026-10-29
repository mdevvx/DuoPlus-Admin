'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import { previewTemplateAction, saveTemplateAction, testTemplateAction, resetTemplateAction, type PreviewResult } from '@/products/team-management/email-actions';
import type { EmailTemplate } from '@/products/team-management/email-api';
import { ACCOUNT_CRITICAL } from '@/products/team-management/email-meta';
import { ConfirmAction } from './confirm-action';
import { fieldHint, fieldLabel as label, Notice } from './form';
import { useToast } from './toast';

type Field = 'subject' | 'heading' | 'body';
const SUBJECT_MAX = 150;
const draftKey = (k: string) => `donexel-email-draft:${k}`;
const oneLine = (v: string) => !/[\r\n]/.test(v);

/** Edit one email's wording with a live preview beside it. The preview is rendered by Donexel and shown in a sandboxed frame. */
export function DonexelTemplateEditor({ template: t, adminEmail, canEdit }: { template: EmailTemplate; adminEmail: string; canEdit: boolean }) {
  const initial = { subject: t.subject, heading: t.heading, body: t.body, buttonLabel: t.buttonLabel, enabled: t.enabled };
  const [v, setV] = useState(initial);
  const [tab, setTab] = useState<'html' | 'text'>('html');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [dark, setDark] = useState(false);
  const [sample, setSample] = useState<'short' | 'long'>('short');
  const [draft, setDraft] = useState<typeof initial | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rendering, setRendering] = useState(true);
  const [testTo, setTestTo] = useState(adminEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const focus = useRef<Field>('body');
  const refs = { subject: useRef<HTMLInputElement>(null), heading: useRef<HTMLInputElement>(null), body: useRef<HTMLTextAreaElement>(null) };
  const toast = useToast();
  const router = useRouter();

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const problems = [
    !v.subject.trim() && 'The subject is required.', v.subject.length > SUBJECT_MAX && `The subject is longer than ${SUBJECT_MAX} characters.`, !oneLine(v.subject) && 'The subject must be a single line.',
    !v.heading.trim() && 'The heading is required.', !oneLine(v.heading) && 'The heading must be a single line.',
    !v.body.trim() && 'The body is required.',
    t.hasLink && !v.buttonLabel.trim() && 'The button label is required: this email has a button.', !oneLine(v.buttonLabel) && 'The button label must be a single line.',
  ].filter((x): x is string => !!x);

  // A draft from an earlier session is offered once, never applied silently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(t.key));
      if (raw) { const d = JSON.parse(raw) as typeof initial; if (JSON.stringify(d) !== JSON.stringify(initial)) setDraft(d); }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.key]);
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(draftKey(t.key), JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [v, dirty, t.key]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Debounced: Donexel renders the draft, so the preview matches what is really sent.
  useEffect(() => {
    setRendering(true);
    const id = setTimeout(() => { void previewTemplateAction(t.key, { subject: v.subject, heading: v.heading, body: v.body, buttonLabel: v.buttonLabel, dark, sample }).then((r) => { setPreview(r); setRendering(false); }); }, 450);
    return () => clearTimeout(id);
  }, [t.key, v.subject, v.heading, v.body, v.buttonLabel, dark, sample]);

  const insert = (name: string) => {
    const f = focus.current;
    const el = refs[f].current;
    const snippet = `{{${name}}}`;
    if (!el) return;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    setV((cur) => ({ ...cur, [f]: cur[f].slice(0, s) + snippet + cur[f].slice(e) }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + snippet.length, s + snippet.length); });
  };

  function save() {
    setError(null);
    start(async () => {
      const r = await saveTemplateAction({ key: t.key, ...v, hasLink: t.hasLink });
      if (r.ok) { try { localStorage.removeItem(draftKey(t.key)); } catch { /* storage unavailable */ } toast(true, r.message); router.refresh(); } else setError(r.error);
    });
  }
  function test() {
    startTest(async () => {
      const r = await testTemplateAction({ key: t.key, to: testTo });
      toast(r.ok, r.ok ? r.message : r.error);
    });
  }

  const disablingCritical = !v.enabled && ACCOUNT_CRITICAL.has(t.key);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        {draft && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span>You have an unsaved draft of this template from earlier.</span>
            <span className="flex gap-2">
              <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => { setV(draft); setDraft(null); }}>Restore draft</button>
              <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => { try { localStorage.removeItem(draftKey(t.key)); } catch { /* ignore */ } setDraft(null); }}>Discard</button>
            </span>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={v.enabled} disabled={!canEdit} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
          <span><b>Send this email.</b> <span className="text-muted">When off, it is skipped and shows as “Skipped” in the outbox.</span></span>
        </label>
        {disablingCritical && <Notice tone="warning">This is an account email. If it is switched off, people may not be able to confirm their account, reset a password or join a workspace.</Notice>}

        <label className="block"><span className={label}>Subject</span>
          <input ref={refs.subject} className="input" value={v.subject} disabled={!canEdit} onFocus={() => (focus.current = 'subject')} onChange={(e) => setV({ ...v, subject: e.target.value })} />
          <span className={clsx('mt-1 block text-right text-xs', v.subject.length > SUBJECT_MAX ? 'text-danger' : v.subject.length > 60 ? 'text-warning' : 'text-muted')}>
            {v.subject.length}/{SUBJECT_MAX}{v.subject.length > 60 && v.subject.length <= SUBJECT_MAX ? ' · inboxes cut around 60' : ''}
          </span></label>
        <label className="block"><span className={label}>Heading</span>
          <input ref={refs.heading} className="input" value={v.heading} disabled={!canEdit} onFocus={() => (focus.current = 'heading')} onChange={(e) => setV({ ...v, heading: e.target.value })} /></label>
        <label className="block"><span className={label}>Body</span>
          <textarea ref={refs.body} className="input h-56 resize-y py-2" value={v.body} disabled={!canEdit} onFocus={() => (focus.current = 'body')} onChange={(e) => setV({ ...v, body: e.target.value })} />
          <span className={fieldHint}>Separate paragraphs with a blank line.</span></label>
        {t.hasLink ? (
          <label className="block"><span className={label}>Button label</span>
            <input className="input" value={v.buttonLabel} disabled={!canEdit} onChange={(e) => setV({ ...v, buttonLabel: e.target.value })} />
            <span className={fieldHint}>The button&apos;s link is always set by Donexel (it can hold a one-time token), never by the template.</span></label>
        ) : <p className="text-xs text-muted">This email has no button.</p>}

        {t.variables.length > 0 && canEdit && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Insert a value</div>
            <div className="flex flex-wrap gap-1.5">
              {t.variables.map((name) => <button key={name} type="button" onClick={() => insert(name)} className="rounded-md border border-line bg-subtle px-2 py-1 font-mono text-xs hover:bg-accent-soft">{`{{${name}}}`}</button>)}
            </div>
            <p className="mt-2 text-xs text-muted">Inserted where your cursor was, in the subject, heading or body.</p>
          </div>
        )}

        {problems.length > 0 && <ul className="space-y-1">{problems.map((p) => <li key={p} className="text-sm text-danger">{p}</li>)}</ul>}
        {error && <Notice tone="danger">{error}</Notice>}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={pending || !dirty || problems.length > 0} onClick={save}>{pending ? 'Saving…' : 'Save template'}</button>
            {dirty && <button type="button" className="btn" onClick={() => setV(initial)}>Discard changes</button>}
            {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
            {t.customized && !dirty && (
              <ConfirmAction label="Reset to default" title="Reset to the default wording" description="Your wording for this email is removed and Donexel's built-in text is used again. The on/off switch is kept as it is."
                reasonRequired={false} small={false} action={resetTemplateAction} hidden={{ key: t.key }} />
            )}
          </div>
        ) : <p className="text-muted">Only admins can edit templates.</p>}

        {canEdit && (
          <div className="rounded-lg border border-line p-3">
            <label className="block">
              <span className={label}>Send a test to</span>
              <span className="flex flex-wrap items-center gap-2">
                <input className="input max-w-xs" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Test recipient" />
                <button type="button" className="btn" disabled={testing || !testTo.trim()} onClick={test}>{testing ? 'Sending…' : 'Send test'}</button>
                {testTo.trim().toLowerCase() !== adminEmail.toLowerCase() && <button type="button" className="text-sm text-accent hover:underline" onClick={() => setTestTo(adminEmail)}>Use my address</button>}
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">Sends the <b>saved</b> version with sample values. Save first to test your changes.</p>
          </div>
        )}
      </div>

      <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" aria-label="Sample data" value={sample} onChange={(e) => setSample(e.target.value as 'short' | 'long')}>
            <option value="short">Short names</option>
            <option value="long">Long names</option>
          </select>
          <div className="flex rounded-lg border border-line" role="group" aria-label="Device">
            <button type="button" aria-pressed={device === 'desktop'} className={clsx('flex h-9 w-9 items-center justify-center rounded-l-lg', device === 'desktop' && 'bg-accent-soft text-accent')} onClick={() => setDevice('desktop')} aria-label="Desktop"><Monitor className="h-4 w-4" /></button>
            <button type="button" aria-pressed={device === 'mobile'} className={clsx('flex h-9 w-9 items-center justify-center rounded-r-lg', device === 'mobile' && 'bg-accent-soft text-accent')} onClick={() => setDevice('mobile')} aria-label="Mobile"><Smartphone className="h-4 w-4" /></button>
          </div>
          <button type="button" aria-pressed={dark} className="btn" onClick={() => setDark((d) => !d)}>{dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />} {dark ? 'Light' : 'Dark'}</button>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">As seen in an inbox</div>
          <div className="mt-1 truncate text-sm font-semibold">{preview?.ok ? preview.preview.subject || '(no subject)' : '…'}</div>
        </div>
        <div role="tablist" aria-label="Preview" className="flex gap-1">
          {(['html', 'text'] as const).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx('rounded-md px-3 py-1 text-sm font-medium', tab === k ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle')}>{k === 'html' ? 'Email' : 'Plain text'}</button>
          ))}
        </div>
        {preview && !preview.ok && <p role="alert" className="text-sm text-danger">{preview.error}</p>}
        {tab === 'html'
          ? <iframe title="Email preview" sandbox="" srcDoc={preview?.ok ? preview.preview.html : ''} className={clsx('mx-auto block h-[640px] w-full rounded-xl border border-line bg-white transition-[max-width]', rendering ? 'preview-busy' : 'preview-ready')} style={{ maxWidth: device === 'mobile' ? 375 : '100%' }} />
          : <pre className="card h-[640px] overflow-auto whitespace-pre-wrap p-4 text-sm" aria-label="Plain-text preview">{preview?.ok ? preview.preview.text : ''}</pre>}
        <p className="text-xs text-muted">Shown with sample values, in a sandboxed frame.</p>
      </div>
    </div>
  );
}
