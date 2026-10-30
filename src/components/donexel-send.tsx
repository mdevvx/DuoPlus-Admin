'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { searchContactsAction, sendEmailAction, type SendOutcome } from '@/products/team-management/email-actions';
import type { EmailContact, SendResult } from '@/products/team-management/email-api';
import { composePreview, MAX_RECIPIENTS, parseRecipients } from '@/products/team-management/email-compose';
import { Card } from './ui';
import { fieldError, fieldHint, fieldLabel as label, Notice } from './form';
import { useToast } from './toast';
import { RichTextarea } from './rich-textarea';

const statusTone = (s: string) => (s === 'sent' ? 'text-success' : s === 'failed' ? 'text-danger' : 'text-muted');

/**
 * One-off emails: one separate message per recipient, sent one after another. The result stays on this page
 * (nothing navigates away), failures can be retried, and sends to more than 20 people need a typed confirmation and a reason.
 */
export function DonexelSend({ prefill, basePath }: { prefill: string[]; basePath: string }) {
  const [recipients, setRecipients] = useState<string[]>(prefill);
  const [draft, setDraft] = useState('');
  const [found, setFound] = useState<EmailContact[]>([]);
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [withButton, setWithButton] = useState(false);
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ results: SendResult[]; sent: number; failed: number } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const n = recipients.length;
  const bulk = n > 20;
  const urlOk = !withButton || /^https:\/\/\S+$/i.test(buttonUrl.trim());
  const buttonOk = !withButton || (buttonLabel.trim().length > 0 && urlOk);
  const ready = n > 0 && n <= MAX_RECIPIENTS && subject.trim().length > 0 && body.trim().length > 0 && buttonOk
    && (n < 2 || confirmed) && (!bulk || (typed.trim() === `SEND ${n}` && reason.trim().length >= 5));
  const preview = useMemo(() => composePreview({ heading, body, button: withButton ? { label: buttonLabel, url: buttonUrl } : null }), [heading, body, withButton, buttonLabel, buttonUrl]);

  // Any change to who or what invalidates the earlier confirmation.
  useEffect(() => { setConfirmed(false); setTyped(''); }, [n, subject, body]);

  // Type to find people among the contacts.
  useEffect(() => {
    const q = draft.trim();
    if (q.length < 2 || q.includes('@') && q.includes(' ')) { setFound([]); return; }
    const id = setTimeout(() => { void searchContactsAction(q).then((r) => setFound(r.ok ? r.items.filter((c) => !recipients.includes(c.email.toLowerCase())) : [])); }, 300);
    return () => clearTimeout(id);
  }, [draft, recipients]);

  function addFromDraft(text = draft) {
    const { valid, invalid } = parseRecipients(text);
    if (valid.length) setRecipients((r) => [...new Set([...r, ...valid])].slice(0, MAX_RECIPIENTS + 25)); // over the cap is shown, not silently cut
    setDraft(''); setFound([]);
    setError(invalid.length ? `Not an email address: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}` : null);
  }

  function send(to: string[], isRetry = false) {
    setError(null);
    start(async () => {
      const r: SendOutcome = await sendEmailAction({
        to, subject, heading: heading || undefined, body, ...(withButton ? { button: { label: buttonLabel, url: buttonUrl } } : {}),
        confirmed: isRetry || confirmed, confirm: typed, reason,
      });
      if (!r.ok) { setError(r.error); return; }
      toast(true, r.message);
      setOutcome((cur) => {
        const fresh = r.results ?? [];
        // A retry replaces the earlier result for the same address.
        const merged = isRetry && cur ? [...cur.results.filter((x) => !fresh.some((y) => y.to === x.to)), ...fresh] : fresh;
        return { results: merged, sent: merged.filter((x) => x.status === 'sent').length, failed: merged.filter((x) => x.status !== 'sent').length };
      });
    });
  }

  if (outcome) {
    const failed = outcome.results.filter((r) => r.status !== 'sent');
    return (
      <div className="max-w-3xl space-y-4">
        <Card title={outcome.failed ? `${outcome.sent} sent, ${outcome.failed} failed` : `${outcome.sent} email${outcome.sent === 1 ? '' : 's'} sent`}>
          {error && <div className="mb-3"><Notice tone="danger">{error}</Notice></div>}
          <ul className="divide-y divide-line">
            {outcome.results.map((r) => (
              <li key={r.to} className="flex items-start gap-3 py-2.5">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.to}</span>{r.error && <span className="block text-xs text-danger">{r.error}</span>}</span>
                <span className={clsx('shrink-0 text-sm font-medium', statusTone(r.status))}>{r.status === 'sent' ? 'Sent' : r.status === 'failed' ? 'Failed' : r.status}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            {failed.length > 0 && <button type="button" className="btn btn-primary" disabled={pending} onClick={() => send(failed.map((r) => r.to), true)}>{pending ? 'Retrying…' : `Retry ${failed.length} failed`}</button>}
            <button type="button" className={failed.length ? 'btn' : 'btn btn-primary'} onClick={() => { setOutcome(null); setRecipients([]); setSubject(''); setHeading(''); setBody(''); setConfirmed(false); setTyped(''); setReason(''); }}>Send another email</button>
            <Link className="btn" href={`${basePath}/email/outbox?source=manual`}>Open the outbox</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-5">
        <Card title="1. Recipients">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line p-2">
            {recipients.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-md bg-accent-soft py-0.5 pl-2 pr-1 text-sm">
                {r}<button type="button" aria-label={`Remove ${r}`} className="rounded p-0.5 text-muted hover:bg-black/10 hover:text-ink" onClick={() => setRecipients((x) => x.filter((y) => y !== r))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <input className="min-w-48 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted" value={draft} placeholder={n ? 'Add another…' : 'Type an address, or search your contacts'}
              onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.includes('@') && addFromDraft()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { if (draft.trim()) { e.preventDefault(); addFromDraft(); } } }}
              onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); addFromDraft(t); } }} aria-label="Recipients" />
          </div>
          {found.length > 0 && (
            <ul className="mt-2 rounded-lg border border-line">
              {found.map((c) => (
                <li key={c.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle" onClick={() => { setRecipients((r) => [...new Set([...r, c.email.toLowerCase()])]); setDraft(''); setFound([]); }}>
                  <span className="min-w-0"><span className="block truncate font-medium">{c.fullName || c.email}</span>{c.fullName && <span className="block truncate text-xs text-muted">{c.email}</span>}</span><span className="text-xs text-accent">Add</span>
                </button></li>
              ))}
            </ul>
          )}
          <p className={fieldHint}>{n} recipient{n === 1 ? '' : 's'} · up to {MAX_RECIPIENTS} at a time. Each person gets a separate message. <b>{'{{name}}'}</b> in the text becomes their name (or “there”).</p>
          {n > MAX_RECIPIENTS && <span role="alert" className={fieldError}>That is more than {MAX_RECIPIENTS}. Remove {n - MAX_RECIPIENTS}.</span>}
        </Card>

        <Card title="2. Message">
          <div className="space-y-4">
            <label className="block"><span className={label}>Subject <span className="text-danger">*</span></span><input className="input" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></label>
            <label className="block"><span className={label}>Heading <span className="font-normal text-muted">· optional</span></span><input className="input" value={heading} maxLength={200} onChange={(e) => setHeading(e.target.value)} /></label>
            <label className="block"><span className={label}>Message <span className="text-danger">*</span></span>
              <RichTextarea mode="markdown" className="h-48" value={body} onChange={(e) => setBody(e.target.value)} />
              <span className={fieldHint}>Plain text. Separate paragraphs with a blank line. No attachments.</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withButton} onChange={(e) => setWithButton(e.target.checked)} /> Add a button</label>
            {withButton && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className={label}>Button label</span><input className="input" value={buttonLabel} maxLength={60} onChange={(e) => setButtonLabel(e.target.value)} /></label>
                <label className="block"><span className={label}>Button link</span><input className={clsx('input', buttonUrl && !urlOk && 'border-danger')} value={buttonUrl} placeholder="https://" onChange={(e) => setButtonUrl(e.target.value)} aria-invalid={!!buttonUrl && !urlOk} />
                  {buttonUrl && !urlOk && <span role="alert" className={fieldError}>The link must start with https://</span>}</label>
              </div>
            )}
          </div>
        </Card>

        <Card title="3. Review and send">
          <div className="space-y-4">
            {n >= 2 && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm sending this to {n} people.</label>}
            {bulk && (
              <>
                <label className="block"><span className={label}>Type <b className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">SEND {n}</b> to confirm</span><input className="input max-w-xs" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
                <label className="block"><span className={label}>Reason <span className="text-danger">*</span> <span className="font-normal text-muted">· saved in the audit log</span></span><textarea className="input h-20 resize-none py-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              </>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={() => send(recipients)}>
              {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending {n} email{n === 1 ? '' : 's'}…</> : `Send ${n || ''} email${n === 1 ? '' : 's'}`}
            </button>
            {pending && n > 1 && <p role="status" className="text-xs text-muted">The emails go out one after another, so this can take a moment. Please keep this page open.</p>}
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="card mb-3 p-3"><div className="text-xs text-muted">Subject</div><div className="mt-1 truncate text-sm font-semibold">{subject || '(no subject)'}</div></div>
        <iframe title="Message preview" sandbox="" srcDoc={preview} className="block h-[560px] w-full rounded-xl border border-line bg-white" />
        <p className="mt-2 text-xs text-muted">An approximate preview. Donexel adds its own header and footer, and fills in each person&apos;s name.</p>
      </div>
    </div>
  );
}
