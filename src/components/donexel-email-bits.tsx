'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, UserCog } from 'lucide-react';
import {
  loadOutboxDetail, resendEmailAction, runRemindersAction, saveEmailSettingsAction, sendPasswordResetAction, setOptOutAction, toggleTemplateAction,
  type OutboxDetailResult,
} from '@/products/team-management/email-actions';
import type { EmailContact, EmailSettings } from '@/products/team-management/email-api';
import { ConfirmAction } from './confirm-action';
import { fieldHint, fieldLabel as label, Notice } from './form';
import { ModalHeader } from './modal-header';
import { CopyBlock } from './small-client';
import { DetailRow } from './ui';
import { useToast } from './toast';

/** Switch a template on or off. Turning one off asks first, and warns for the emails people need to get into their account. */
export function TemplateSwitch({ tplKey, enabled, critical, canEdit }: { tplKey: string; enabled: boolean; critical: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!canEdit) return null;
  if (enabled) {
    return <ConfirmAction label="Switch off" title="Switch off this email" compact reasonRequired={false} action={toggleTemplateAction} hidden={{ key: tplKey, enabled: 'false' }}
      description={critical ? 'This is an account email. If it is off, people may not be able to confirm their account, reset a password or join a workspace.' : 'It will be skipped instead of sent, and show as “Skipped” in the outbox.'} />;
  }
  return (
    <button type="button" className="btn h-7 px-2.5 text-xs" disabled={pending} onClick={() => start(async () => {
      const fd = new FormData(); fd.set('key', tplKey); fd.set('enabled', 'true');
      const r = await toggleTemplateAction(fd);
      toast(r.ok, r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    })}>{pending ? 'Working…' : 'Switch on'}</button>
  );
}

/** Runs the due reminders now. Donexel also does this every 15 minutes and never sends the same reminder twice. */
export function RunRemindersButton() {
  return (
    <ConfirmAction label="Run reminders now" title="Run reminders now" small={false} reasonRequired={false} hidden={{}}
      description="Sends every reminder that is due right now: trial endings, renewals, overdue payments and so on. Nobody gets the same reminder twice."
      action={async (fd) => { void fd; const r = await runRemindersAction(); return r.ok ? { ...r, message: `${r.message}${r.counts ? breakdown(r.counts) : ''}` } : r; }} />
  );
}
const breakdown = (c: Record<string, number>) => { const parts = Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${n}`); return parts.length ? ` (${parts.join(', ')})` : ''; };

const STATUS_LABEL: Record<string, string> = { sent: 'Sent', failed: 'Failed', skipped: 'Skipped', queued: 'Queued' };

/** The full email behind an outbox row, loaded when opened: its text, the plain-language error and, when allowed, a Resend. */
export function OutboxDetailButton({ id, canEdit }: { id: string; canEdit: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<OutboxDetailResult | null>(null);
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [resending, startResend] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function open() {
    ref.current?.showModal();
    setSure(false);
    start(async () => setState(await loadOutboxDetail(id)));
  }
  function resend() {
    startResend(async () => {
      const fd = new FormData(); fd.set('id', id);
      const r = await resendEmailAction(fd);
      toast(r.ok, r.ok ? r.message : r.error);
      if (r.ok) { ref.current?.close(); router.refresh(); }
      setSure(false);
    });
  }
  const item = state?.ok ? state.item : null;
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={open}>Details</button>
      <dialog ref={ref} className="w-[640px] max-w-[94vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={Mail} title="Email details" description={item?.subject} onClose={() => ref.current?.close()} />
        <div className="thin-scroll max-h-[65vh] overflow-y-auto overflow-x-hidden px-5 py-4">
          {pending && !state && <p className="flex items-center gap-2 text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
          {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}
          {item && (
            <>
              <dl className="divide-y divide-line text-sm">
                <DetailRow label="To" copy={item.to}>{item.to}{item.toName ? ` · ${item.toName}` : ''}</DetailRow>
                <DetailRow label="Subject" copy={item.subject}>{item.subject}</DetailRow>
                <DetailRow label="Status">{STATUS_LABEL[item.status] ?? item.status}</DetailRow>
                {item.error && <DetailRow label="Error" copy={item.error}>{item.error}</DetailRow>}
                <DetailRow label="Source">{item.source}{item.templateKey ? ` · ${item.templateKey}` : ''}</DetailRow>
                <DetailRow label="Sent by">{item.sentBy ?? 'Automatic'}</DetailRow>
                <DetailRow label="Created">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</DetailRow>
              </dl>
              <div className="mt-4">
                <div className="mb-1.5 text-sm font-medium">Message</div>
                {item.body ? <CopyBlock text={item.body} label="Copy text" /> : <p className="text-sm text-muted">No text was stored.</p>}
                <p className="mt-2 text-xs text-muted">One-time links in account emails are never stored, so the text shows without the link.</p>
              </div>
            </>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-5 py-3.5">
          <span className="text-xs text-muted">{item && !item.canResend ? 'This email cannot be resent (it carried a one-time link, or was skipped).' : ''}</span>
          <span className="flex gap-2">
            {canEdit && item?.canResend && (sure
              ? <><button type="button" className="btn" onClick={() => setSure(false)} disabled={resending}>Cancel</button><button type="button" className="btn btn-primary" onClick={resend} disabled={resending}>{resending ? 'Sending…' : 'Yes, resend it'}</button></>
              : <button type="button" className="btn" onClick={() => setSure(true)}>Resend</button>)}
            <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button>
          </span>
        </footer>
      </dialog>
    </>
  );
}

/** The things you can do for one contact: email them, see their history, switch reminders, send a password reset. */
export function ContactManage({ contact: c, base, canEdit }: { contact: EmailContact; base: string; canEdit: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => ref.current?.showModal()}>Manage</button>
      <dialog ref={ref} className="w-[520px] max-w-[94vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={UserCog} title={c.fullName || c.email} description={c.fullName ? c.email : undefined} onClose={() => ref.current?.close()} />
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Link className="btn" href={`${base}/email/send?to=${encodeURIComponent(c.email)}`}>Send email</Link>
            <Link className="btn" href={`${base}/email/outbox?q=${encodeURIComponent(c.email)}`}>View history</Link>
          </div>
          {canEdit && (
            <div className="space-y-3 border-t border-line pt-4">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {c.remindersOptedOut
                    ? <ConfirmAction label="Switch reminders back on" title="Switch reminders back on" reasonRequired={false} action={setOptOutAction} hidden={{ email: c.email, optedOut: 'false' }} description="They will get reminders again." />
                    : <ConfirmAction label="Switch reminders off" title="Switch reminders off" reasonRequired={false} action={setOptOutAction} hidden={{ email: c.email, optedOut: 'true' }} description="They stop getting reminder emails." />}
                </div>
                <p className="text-xs text-muted">This stops <b>reminders only</b>. Account and billing emails are always sent.</p>
              </div>
              <div>
                <div className="mb-1.5"><ConfirmAction label="Send password reset" title="Send a password reset email" reasonRequired={false} action={sendPasswordResetAction} hidden={{ id: c.id }} description={`Sends ${c.email} a link to choose a new password.`} /></div>
                <p className="text-xs text-muted">Use this when someone cannot get into their account, for example a lost one-time link.</p>
              </div>
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t border-line bg-subtle px-5 py-3.5"><button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button></footer>
      </dialog>
    </>
  );
}

/** Sender name, reply-to, footer and the reminders master switch. The mail server login itself is configured on the Donexel server and never shown here. */
export function EmailSettingsForm({ settings: s, canEdit }: { settings: EmailSettings; canEdit: boolean }) {
  const [v, setV] = useState({ fromName: s.fromName, replyTo: s.replyTo, footer: s.footer, remindersEnabled: s.remindersEnabled });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(v) !== JSON.stringify({ fromName: s.fromName, replyTo: s.replyTo, footer: s.footer, remindersEnabled: s.remindersEnabled });
  const replyOk = v.replyTo === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.replyTo.trim());
  return (
    <form className="max-w-xl space-y-5" onSubmit={(e) => {
      e.preventDefault(); setError(null);
      start(async () => { const r = await saveEmailSettingsAction({ ...v, replyTo: v.replyTo.trim() }); if (r.ok) { toast(true, r.message); router.refresh(); } else setError(r.error); });
    }}>
      <label className="block"><span className={label}>Sender name</span><input className="input" value={v.fromName} maxLength={80} disabled={!canEdit} onChange={(e) => setV({ ...v, fromName: e.target.value })} />
        <span className={fieldHint}>Shown before the sender address{s.senderAddress ? ` (${s.senderAddress})` : ''}.</span></label>
      <label className="block"><span className={label}>Reply-to address <span className="font-normal text-muted">· optional</span></span><input className="input" type="email" value={v.replyTo} disabled={!canEdit} onChange={(e) => setV({ ...v, replyTo: e.target.value })} aria-invalid={!replyOk} />
        <span className={fieldHint}>Where replies go. Leave empty for none.</span></label>
      <label className="block"><span className={label}>Footer</span><textarea className="input h-24 resize-y py-2" value={v.footer} maxLength={2000} disabled={!canEdit} onChange={(e) => setV({ ...v, footer: e.target.value })} />
        <span className={fieldHint}>Shown at the bottom of every email.</span></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={v.remindersEnabled} disabled={!canEdit} onChange={(e) => setV({ ...v, remindersEnabled: e.target.checked })} />
        <span><b>Send reminder emails.</b> <span className="text-muted">The master switch for trial, renewal, payment and access reminders. Account and billing emails are not affected.</span></span></label>
      {error && <Notice tone="danger">{error}</Notice>}
      {canEdit
        ? <button className="btn btn-primary" disabled={pending || !dirty || !replyOk || !v.fromName.trim()}>{pending ? 'Saving…' : 'Save settings'}</button>
        : <p className="text-muted">Only admins can change email settings.</p>}
    </form>
  );
}
