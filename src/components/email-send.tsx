'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { batchStatus, checkRecipients, previewEmail, sendManual, sendTest, type PreviewResult, type RecipientCheck } from '@/products/disconotify/email-actions';
import { hasErrors, validateTemplate } from '@/products/disconotify/email/validate';
import { htmlToText } from '@/products/disconotify/email/render';
import { SUBJECT_MAX, VAR_NAMES } from '@/products/disconotify/email/vars';
import { DateField } from './date-field';
import { Card } from './ui';
import { EmailButtonList, EmailButtonPicker } from './email-button';
import { BatchProgress } from './email-row-actions';
import { fieldLabel as label } from './form';
import { useToast } from './toast';

export interface TemplateOption { key: string; name: string; category: string; subject: string; preheader: string; html: string; text: string }
interface Prefill { guildId?: string; templateKey?: string; subject?: string; html?: string; text?: string; marketing?: boolean }

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const STATES: [string, string][] = [['trial', 'Trial'], ['active', 'Active (paid)'], ['card_past_due', 'Card past due'], ['lapsed', 'Lapsed']];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <Card title={`${n}. ${title}`}>{children}</Card>;
}

export function EmailSend({ templates, base, prefill, adminEmail, accent }: { templates: TemplateOption[]; base: string; prefill?: Prefill; adminEmail: string; accent: string }) {
  const [testTo, setTestTo] = useState(adminEmail);
  const [recMode, setRecMode] = useState<'server' | 'filter' | 'addresses'>('server');
  const [guildId, setGuildId] = useState(prefill?.guildId ?? '');
  const [states, setStates] = useState<string[]>([]);
  const [addresses, setAddresses] = useState('');
  const [mode, setMode] = useState<'template' | 'custom'>(prefill?.templateKey || !prefill?.html ? 'template' : 'custom');
  const [tplKey, setTplKey] = useState(prefill?.templateKey ?? templates[0]?.key ?? '');
  const [subjectOverride, setSubjectOverride] = useState('');
  const [extra, setExtra] = useState('');
  const [custom, setCustom] = useState({ subject: prefill?.subject ?? '', html: prefill?.html ?? '', text: prefill?.text ?? '', marketing: prefill?.marketing ?? true });
  const [check, setCheck] = useState<RecipientCheck | null>(null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [sendDay, setSendDay] = useState('');
  const [sendTime, setSendTime] = useState('09:00');
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const [testing, startTest] = useTransition();
  const toast = useToast();
  // After a send the progress shows right here instead of navigating to another page, so nothing reloads.
  const [sent, setSent] = useState<{ batch: string; count: number; initial: Awaited<ReturnType<typeof batchStatus>> } | null>(null);

  const today = isoDay(new Date());
  const latest = isoDay(new Date(Date.now() + 30 * 86400_000));
  const tpl = templates.find((t) => t.key === tplKey);
  const marketing = mode === 'custom' ? custom.marketing : tpl?.category === 'marketing';
  const body = mode === 'custom'
    ? { subject: custom.subject, preheader: '', html: custom.html, text: custom.text, category: custom.marketing ? 'marketing' : 'transactional' }
    : { subject: subjectOverride.trim() || tpl?.subject || '', preheader: tpl?.preheader ?? '', html: tpl?.html ?? '', text: tpl?.text ?? '', category: tpl?.category ?? 'transactional' };
  const issues = validateTemplate(body);
  const contentOk = mode === 'template' ? !!tpl && !(subjectOverride.length > SUBJECT_MAX) : !hasErrors(issues);

  const recipients = () => recMode === 'server' ? { mode: 'server' as const, guildId: guildId.trim() }
    : recMode === 'filter' ? { mode: 'filter' as const, states: states as ('trial' | 'active' | 'lapsed' | 'card_past_due')[] }
    : { mode: 'addresses' as const, text: addresses };
  const extraMap = () => Object.fromEntries(extra.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2 && VAR_NAMES.has(p[0]!.trim())).map((p) => [p[0]!.trim(), p.slice(1).join('=').trim()]));

  // Any change to who or what invalidates the earlier count and confirmation.
  useEffect(() => { setCheck(null); setConfirmed(false); setTyped(''); }, [recMode, guildId, states, addresses, marketing]);

  useEffect(() => {
    const t = setTimeout(() => { void previewEmail({ ...body, sample: 'normal', dark: false }).then(setPreview); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.subject, body.preheader, body.html, body.text, body.category]);

  function runCheck() {
    setError(null);
    startCheck(async () => setCheck(await checkRecipients(recipients(), !!marketing)));
  }

  function test() {
    startTest(async () => {
      const key = mode === 'template' ? tplKey : '';
      const res = await sendTest({ key, subject: body.subject, html: body.html, text: body.text || htmlToText(body.html), category: body.category, sample: 'normal', to: testTo });
      toast(res.ok, res.ok ? res.message : res.error);
    });
  }

  const n = check?.ok ? check.total : 0;
  const ready = !!check?.ok && n > 0 && !check.overLimit && contentOk && (when === 'now' || !!sendDay);
  const bulk = n > 20;
  const typedOk = !bulk || typed.trim() === `SEND ${n}`;
  const confirmOk = n < 2 || confirmed;
  const reasonOk = !bulk || reason.trim().length >= 5;

  function send() {
    setError(null);
    startSend(async () => {
      const res = await sendManual({
        recipients: recipients(),
        content: mode === 'template'
          ? { mode: 'template', key: tplKey, subject: subjectOverride.trim() || undefined, extra: extraMap() }
          : { mode: 'custom', subject: custom.subject, preheader: '', html: custom.html, text: custom.text || htmlToText(custom.html), marketing: custom.marketing },
        sendAt: when === 'later' && sendDay ? new Date(`${sendDay}T${sendTime}`).toISOString() : null,
        confirmed, confirm: typed, reason, code: code || undefined,
      });
      if (!res.ok) {
        if (res.needsStepUp) { setNeedsCode(true); if (res.stepUpInvalid) setError(res.error); }
        else setError(res.error);
      } else if (res.batch) {
        toast(true, res.message);
        setSent({ batch: res.batch, count: n, initial: await batchStatus(res.batch) });
      }
    });
  }

  if (sent) {
    return (
      <div className="max-w-4xl space-y-4">
        <Card title={`${sent.count} email${sent.count === 1 ? '' : 's'} queued`}>
          <BatchProgress batch={sent.batch} initial={sent.initial} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-primary" onClick={() => { setSent(null); setCheck(null); setConfirmed(false); setTyped(''); setReason(''); setCode(''); setNeedsCode(false); }}>Send another email</button>
            <Link className="btn" href={`${base}/email/outbox?kind=manual`}>Open the outbox</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-5">
        <Section n={1} title="Recipients">
          <div role="radiogroup" aria-label="Recipients" className="mb-4 flex flex-wrap gap-2">
            {([['server', 'One server'], ['filter', 'Servers by state'], ['addresses', 'Pasted addresses']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={recMode === v} onClick={() => setRecMode(v)}
                className={clsx('rounded-lg border px-3 py-1.5 text-sm font-medium', recMode === v ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-subtle')}>{l}</button>
            ))}
          </div>
          {recMode === 'server' && <label className="block"><span className={label}>Server ID</span><input className="input max-w-sm" inputMode="numeric" value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="1234567890123456789" /></label>}
          {recMode === 'filter' && (
            <fieldset><legend className={label}>State (matches any)</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">{STATES.map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={states.includes(v)} onChange={(e) => setStates(e.target.checked ? [...states, v] : states.filter((x) => x !== v))} /> {l}</label>
              ))}</div>
            </fieldset>
          )}
          {recMode === 'addresses' && <label className="block"><span className={label}>Addresses <span className="font-normal text-muted">· separated by spaces, commas or new lines. Sent with no server, so server variables are empty.</span></span>
            <textarea className="input h-28 resize-y py-2 font-mono text-xs" value={addresses} onChange={(e) => setAddresses(e.target.value)} /></label>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={checking} onClick={runCheck}>{checking ? 'Checking…' : 'Check recipients'}</button>
            {check?.ok && (
              <span role="status" className="text-sm">
                <b className="num">{check.total}</b> email{check.total === 1 ? '' : 's'}{check.servers > 0 && <> across <b className="num">{check.servers}</b> server{check.servers === 1 ? '' : 's'}</>}
                {(check.skipped.noContacts + check.skipped.unsubscribed + check.skipped.invalid + check.skipped.whitelisted) > 0 && (
                  <span className="text-muted"> · skipped: {[check.skipped.noContacts && `${check.skipped.noContacts} server(s) with no email`, check.skipped.unsubscribed && `${check.skipped.unsubscribed} unsubscribed`, check.skipped.invalid && `${check.skipped.invalid} invalid`, check.skipped.whitelisted && `${check.skipped.whitelisted} whitelisted (never emailed)`].filter(Boolean).join(', ')}</span>
                )}
              </span>
            )}
            {check && !check.ok && <span role="alert" className="text-sm text-danger">{check.error}</span>}
          </div>
          {check?.ok && check.sample.length > 0 && <p className="mt-2 text-xs text-muted">First addresses: {check.sample.join(', ')}</p>}
          {check?.ok && check.overLimit && <p role="alert" className="mt-2 text-sm text-danger">That is more than the 200 recipients per hour a manual send can reach. Narrow it down.</p>}
        </Section>

        <Section n={2} title="Content">
          <div role="radiogroup" aria-label="Content" className="mb-4 flex gap-2">
            {([['template', 'Use a template'], ['custom', 'Custom email']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                className={clsx('rounded-lg border px-3 py-1.5 text-sm font-medium', mode === v ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-subtle')}>{l}</button>
            ))}
          </div>
          {mode === 'template' ? (
            <div className="space-y-4">
              <label className="block"><span className={label}>Template <span className="font-normal text-muted">· switched-off templates work too</span></span>
                <select className="input max-w-md" value={tplKey} onChange={(e) => setTplKey(e.target.value)}>{templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
              <label className="block"><span className={label}>Subject <span className="font-normal text-muted">· optional override</span></span>
                <input className="input" value={subjectOverride} maxLength={SUBJECT_MAX} placeholder={tpl?.subject} onChange={(e) => setSubjectOverride(e.target.value)} /></label>
              <label className="block"><span className={label}>Extra variables <span className="font-normal text-muted">· one per line, e.g. trial_days=14. The server name is filled in automatically.</span></span>
                <textarea className="input h-20 resize-y py-2 font-mono text-xs" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block"><span className={label}>Subject</span><input className="input" value={custom.subject} maxLength={SUBJECT_MAX + 50} onChange={(e) => setCustom({ ...custom, subject: e.target.value })} /></label>
              <div className="flex flex-wrap items-center gap-2">
                <EmailButtonPicker accent={accent} onInsert={(html, text) => setCustom((c) => ({ ...c, html: `${c.html.trimEnd()}\n${html}`, text: text ? `${c.text.trimEnd()}\n\n${text}` : c.text }))} />
                <span className="text-xs text-muted">Buttons are added at the end of the body. Use the list below to move them.</span>
              </div>
              <EmailButtonList html={custom.html} accent={accent} onChange={(html) => setCustom((c) => ({ ...c, html }))} />
              <label className="block"><span className={label}>HTML body</span><textarea className="input h-48 resize-y py-2 font-mono text-xs" value={custom.html} onChange={(e) => setCustom({ ...custom, html: e.target.value })} /></label>
              <label className="block"><span className={label}>Plain text <button type="button" className="ml-2 text-accent hover:underline" onClick={() => setCustom({ ...custom, text: htmlToText(custom.html) })}>Generate from HTML</button></span>
                <textarea className="input h-28 resize-y py-2 font-mono text-xs" value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} /></label>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={custom.marketing} onChange={(e) => setCustom({ ...custom, marketing: e.target.checked })} />
                <span>This is a reminder or marketing email. It carries the unsubscribe link and skips people who unsubscribed.</span></label>
              {issues.length > 0 && <ul className="space-y-1">{issues.map((i, k) => <li key={k} className={clsx('text-sm', i.level === 'error' ? 'text-danger' : 'text-warning')}>{i.field}{i.line ? ` line ${i.line}` : ''}: {i.message}</li>)}</ul>}
            </div>
          )}
        </Section>

        <Section n={3} title="Review and send">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Send now</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} /> Schedule</label>
              {when === 'later' && (
                <span className="flex items-center gap-2">
                  <DateField name="sendDay" defaultValue={sendDay} placeholder="Pick a day" ariaLabel="Send on" onChange={setSendDay} minDate={today} maxDate={latest} />
                  <select className="input w-auto" aria-label="Time" value={sendTime} onChange={(e) => setSendTime(e.target.value)}>
                    {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="text-xs text-muted">your local time</span>
                </span>
              )}
            </div>
            {when === 'later' && <p className="text-xs text-muted">Up to 30 days ahead. A scheduled batch can be cancelled from its progress page while it is still queued.</p>}

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><span className="font-medium">Send a test to</span>
                <input className="input w-64" type="email" value={testTo} placeholder={adminEmail} onChange={(e) => setTestTo(e.target.value)} aria-label="Test recipient" /></label>
              <button type="button" className="btn" disabled={testing || !contentOk || !testTo.trim()} onClick={test}>{testing ? 'Queuing…' : 'Send test'}</button>
              <span className="text-xs text-muted">{bulk ? 'A test is required before a send to more than 20 people.' : 'Strongly recommended.'}</span>
            </div>

            {n >= 2 && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm sending this to {n} recipients.</label>}
            {bulk && (
              <>
                <label className="block"><span className={label}>Type <b className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">SEND {n}</b> to confirm</span>
                  <input className="input max-w-xs" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
                <label className="block"><span className={label}>Reason <span className="text-danger">*</span> <span className="font-normal text-muted">· saved in the audit log</span></span>
                  <textarea className="input h-20 resize-none py-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              </>
            )}
            {(needsCode || n > 100) && (
              <label className="block"><span className={label}>Authenticator code <span className="font-normal text-muted">· needed for more than 100 recipients</span></span>
                <input className="input num w-40 text-center tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" /></label>
            )}
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
            <button type="button" className="btn btn-primary" disabled={sending || !ready || !typedOk || !confirmOk || !reasonOk} onClick={send}>
              {sending ? 'Queuing…' : when === 'later' ? `Schedule ${n || ''} email${n === 1 ? '' : 's'}` : `Send ${n || ''} email${n === 1 ? '' : 's'}`}
            </button>
            {!check?.ok && <p className="text-xs text-muted">Check the recipients first so the count is known.</p>}
            {marketing && <p className="text-xs text-muted">This is a marketing email: people who unsubscribed are skipped, even for manual sends.</p>}
          </div>
        </Section>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="card mb-3 p-3">
          <div className="text-xs text-muted">Subject and preheader</div>
          <div className="mt-1 truncate text-sm font-semibold">{preview?.ok ? preview.subject || '(no subject)' : '…'}</div>
          <div className="truncate text-sm text-muted">{preview?.ok ? preview.preheader : ''}</div>
        </div>
        <iframe title="Email preview" sandbox="" srcDoc={preview?.ok ? preview.document : ''} className="block h-[640px] w-full rounded-xl border border-line bg-white" />
        <p className="mt-2 text-xs text-muted">Preview with sample data. Each recipient gets their own server name.</p>
      </div>
    </div>
  );
}
