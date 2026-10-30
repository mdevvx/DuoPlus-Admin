'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Maximize2, Minimize2, UserCog } from 'lucide-react';
import clsx from 'clsx';
import {
  addContactAction, eraseAddressAction, loadOutboxDetail, previewTemplateAction, removeContactAction, resendEmailAction, restoreVersionAction, runRemindersAction, saveEmailSettingsAction, saveLayoutAction,
  sendPasswordResetAction, setOptOutAction, toggleTemplateAction, type OutboxDetailResult, type PreviewResult,
} from '@/products/team-management/email-actions';
import type { EmailContact, EmailLayout, EmailSettings } from '@/products/team-management/email-api';
import { ConfirmAction } from './confirm-action';
import { fieldHint, fieldLabel as label, Notice } from './form';
import { ModalHeader } from './modal-header';
import { CopyBlock } from './small-client';
import { Badge, DetailRow, type Tone } from './ui';
import { useToast } from './toast';
import { RichTextarea } from './rich-textarea';

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
const STATUS_TONE: Record<string, Tone> = { sent: 'success', failed: 'danger', queued: 'info', skipped: 'neutral' };
const STATUS_MARK: Record<string, string> = { sent: '✓ ', failed: '✕ ', skipped: '– ' };

/** Same status badge as the DiscoNotify outbox: a small mark before the word so it reads without colour. */
export function OutboxStatus({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{STATUS_MARK[status] ?? '… '}{STATUS_LABEL[status] ?? status}</Badge>;
}

/** The quick action beside Details: a failed email can be sent again without opening it. */
export function OutboxRowActions({ id, canResend, canEdit, failed }: { id: string; canResend: boolean; canEdit: boolean; failed: boolean }) {
  if (!canEdit || !canResend) return null;
  return <ConfirmAction label="Resend" title="Resend this email" reasonRequired={false} compact action={resendEmailAction} hidden={{ id }}
    description={failed ? 'Retries this email right away and counts as another attempt.' : 'Sends a new copy to the same address right away. The original stays in the outbox.'} />;
}

/** The full email behind an outbox row, loaded when opened: its text, the plain-language error and, when allowed, a Resend. */
export function OutboxDetailButton({ id, canEdit, templateName, base }: { id: string; canEdit: boolean; templateName?: string; base: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<OutboxDetailResult | null>(null);
  const [pending, start] = useTransition();
  const [wide, setWide] = useState(false);

  function open() {
    ref.current?.showModal();
    start(async () => setState(await loadOutboxDetail(id)));
  }
  const item = state?.ok ? state.item : null;
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={open}>Details</button>
      <dialog ref={ref} className={clsx('max-w-[96vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px] transition-[width] duration-150', wide ? 'w-[1040px]' : 'w-[520px]')}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={Mail} title="Email details" onClose={() => ref.current?.close()}
          actions={<button type="button" aria-label={wide ? 'Make narrower' : 'Make wider'} title={wide ? 'Make narrower' : 'Make wider'} onClick={() => setWide(!wide)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink sm:flex">{wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>} />
        <div className="thin-scroll max-h-[65vh] overflow-y-auto overflow-x-hidden px-5 py-4">
          {pending && !state && <p className="flex items-center gap-2 text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
          {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}
          {item && (
            <>
              <div className="mb-3"><OutboxStatus status={item.status} /></div>
              <dl className="divide-y divide-line text-sm">
                <DetailRow label="To" copy={item.to}>{item.to}{item.toName ? ` · ${item.toName}` : ''}</DetailRow>
                <DetailRow label="Subject" copy={item.subject}>{item.subject || '—'}</DetailRow>
                <DetailRow label="Template">{templateName ?? (item.templateKey ? humanizeKey(item.templateKey) : 'Custom')}</DetailRow>
                <DetailRow label="Kind">{SOURCE_LABEL[item.source] ?? humanizeKey(item.source)}</DetailRow>
                <DetailRow label="Workspace">{item.workspaceName ?? '—'}</DetailRow>
                <DetailRow label="Created">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</DetailRow>
                <DetailRow label="Attempts">{item.attempts}</DetailRow>
                <DetailRow label="Sent by">{item.sentBy ?? 'Automatic'}</DetailRow>
                <DetailRow label="Detail" copy={item.status === 'sent' ? null : item.error}>{item.status === 'sent' ? 'Delivered to the mail server' : item.error ?? '—'}</DetailRow>
              </dl>
              <div className="mt-4">
                <div className="mb-1.5 text-sm font-medium">Message</div>
                {item.body ? <CopyBlock text={item.body} label="Copy text" /> : <p className="text-sm text-muted">No text was stored.</p>}
                <p className="mt-2 text-xs text-muted">One-time links in account emails are never stored, so the text shows without the link.</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                {canEdit && item.canResend && (
                  <ConfirmAction label="Resend" title="Resend this email" description="Sends it again to the same address right away." reasonRequired={false} compact action={resendEmailAction} hidden={{ id }} />
                )}
                {canEdit && <Link className="text-accent hover:underline" href={`${base}/email/send?to=${encodeURIComponent(item.to)}`}>Send a new email to this address</Link>}
              </div>
              {!item.canResend && <p className="mt-2 text-xs text-muted">This email cannot be resent (it carried a one-time link or sign-in code, or was skipped).</p>}
            </>
          )}
        </div>
        <footer className="flex justify-end border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button>
        </footer>
      </dialog>
    </>
  );
}
const SOURCE_LABEL: Record<string, string> = { system: 'Automatic', reminder: 'Reminder', manual: 'Manual' };
const humanizeKey = (k: string) => { const t = k.replace(/[_-]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Reminders on/off beside Manage, like Unsubscribe / Re-subscribe in DiscoNotify. This stops reminders only. */
/** Only addresses added by hand can be removed. Accounts are managed in Donexel itself. */
export function ContactRemove({ id, canEdit }: { id: string; canEdit: boolean }) {
  if (!canEdit) return null;
  return <ConfirmAction label="Remove" title="Remove this contact" description="The address is removed from this list. Emails already sent stay in the outbox." reasonRequired={false} danger compact action={removeContactAction} hidden={{ id }} />;
}

export function AddContact() {
  return (
    <ConfirmAction label="Add contact" title="Add a contact" description="Adds an address by hand. It only receives emails you send to it." small={false} reasonRequired={false} action={addContactAction} hidden={{}}
      fields={[{ name: 'email', label: 'Email address', placeholder: 'name@example.com' }, { name: 'name', label: 'Name', placeholder: 'Optional', optional: true }]} />
  );
}

export function EraseAddress() {
  return (
    <ConfirmAction label="Delete an address everywhere" title="Delete this address everywhere" danger small={false} action={eraseAddressAction} hidden={{}}
      description="Deletes the address from contacts, the reminder opt-out list and every email in the outbox. It is refused while the address still has an account. This cannot be undone."
      fields={[{ name: 'email', label: 'Email address' }, { name: 'confirm', label: 'Type the address again to confirm' }]} />
  );
}

export function RestoreVersion({ tplKey, version }: { tplKey: string; version: number }) {
  return (
    <ConfirmAction label="Restore" title={`Restore version ${version}`} description="Saves that version's wording as a new version. Nothing is deleted from the history." reasonRequired={false} compact action={restoreVersionAction} hidden={{ key: tplKey, version: String(version) }} />
  );
}

export function ContactReminders({ email, optedOut, canEdit }: { email: string; optedOut: boolean; canEdit: boolean }) {
  if (!canEdit) return null;
  return optedOut
    ? <ConfirmAction label="Switch on" title="Switch reminders back on" reasonRequired={false} compact action={setOptOutAction} hidden={{ email, optedOut: 'false' }} description="They will get reminders again." />
    : <ConfirmAction label="Switch off" title="Switch reminders off" reasonRequired={false} compact action={setOptOutAction} hidden={{ email, optedOut: 'true' }} description="They stop getting reminder emails. Account and billing emails are always sent." />;
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
      <label className="block"><span className={label}>Support address <span className="font-normal text-muted">· optional</span></span><input className="input" type="email" value={v.replyTo} disabled={!canEdit} onChange={(e) => setV({ ...v, replyTo: e.target.value })} aria-invalid={!replyOk} />
        <span className={fieldHint}>Shown in every email&apos;s &quot;don&apos;t reply&quot; notice and used for replies. Leave empty to use the server default.</span></label>
      <label className="block"><span className={label}>Footer</span><textarea className="input h-24 resize-y py-2" value={v.footer} maxLength={2000} disabled={!canEdit} onChange={(e) => setV({ ...v, footer: e.target.value })} />
        <span className={fieldHint}>Shown at the bottom of every email. Donexel adds the &quot;don&apos;t reply, contact support&quot; notice itself, so don&apos;t repeat it here.</span></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={v.remindersEnabled} disabled={!canEdit} onChange={(e) => setV({ ...v, remindersEnabled: e.target.checked })} />
        <span><b>Send reminder emails.</b> <span className="text-muted">The master switch for trial, renewal, payment and access reminders. Account and billing emails are not affected.</span></span></label>
      {error && <Notice tone="danger">{error}</Notice>}
      {canEdit
        ? <button className="btn btn-primary" disabled={pending || !dirty || !replyOk || !v.fromName.trim()}>{pending ? 'Saving…' : 'Save settings'}</button>
        : <p className="text-muted">Only admins can change email settings.</p>}
    </form>
  );
}

/** Brand name, accent colour, logo and footer. Saved on the Donexel server; the preview on a template page shows them. */
export function LayoutForm({ layout: l, canEdit, previewKey, logoSrc, brandingHref }: { layout: EmailLayout; canEdit: boolean; previewKey?: string; logoSrc: string; brandingHref: string }) {
  const [v, setV] = useState(l);
  const [showLogo, setShowLogo] = useState(!!l.logoUrl);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(v) !== JSON.stringify(l) || showLogo !== !!l.logoUrl;
  const colourOk = /^#[0-9a-f]{6}$/i.test(v.accentColor);

  // Donexel renders a sample email with the unsaved layout, so the preview matches what a save would produce.
  useEffect(() => {
    if (!previewKey || !colourOk || !v.brandName.trim()) { setRendering(false); return; }
    setRendering(true);
    const id = setTimeout(() => { void previewTemplateAction(previewKey, { layout: { ...v, logoUrl: showLogo ? l.logoUrl : '' } }).then((r) => { setPreview(r); setRendering(false); }); }, 450);
    return () => clearTimeout(id);
  }, [previewKey, v, showLogo, l.logoUrl, colourOk]);

  return (
    <div className="space-y-6">
    <form className="max-w-xl space-y-5" onSubmit={(e) => {
      e.preventDefault(); setError(null);
      start(async () => { const r = await saveLayoutAction({ brandName: v.brandName, accentColor: v.accentColor, footerHtml: v.footerHtml, footerText: v.footerText, showLogo }); if (r.ok) { toast(true, r.message); router.refresh(); } else setError(r.error); });
    }}>
      <label className="block"><span className={label}>Brand name</span><input className="input" value={v.brandName} maxLength={60} disabled={!canEdit} onChange={(e) => setV({ ...v, brandName: e.target.value })} />
        <span className={fieldHint}>Shown in the header of every email, and available as <code>{'{{app_name}}'}</code> in the wording.</span></label>
      <div>
        <span className={label}>Accent colour</span>
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Pick colour" type="color" className="h-9 w-12 rounded border border-line bg-surface" disabled={!canEdit} value={colourOk ? v.accentColor : '#5B6CF0'} onChange={(e) => setV({ ...v, accentColor: e.target.value })} />
          <input className="input w-32 font-mono" value={v.accentColor} maxLength={7} disabled={!canEdit} onChange={(e) => setV({ ...v, accentColor: e.target.value })} aria-label="Accent colour hex" aria-invalid={!colourOk} />
        </div>
        <span className={fieldHint}>Used on the button and the brand header.</span>
      </div>
      <div>
        <span className={label}>Logo</span>
        <div className="flex items-center gap-4 rounded-lg border border-line p-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {showLogo ? <img src={logoSrc} alt={`${v.brandName} logo`} className="max-h-full max-w-full object-contain" /> : <span className="px-1 text-center text-xs font-semibold" style={{ color: v.accentColor }}>{v.brandName}</span>}
          </span>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="logo" disabled={!canEdit} checked={showLogo} onChange={() => setShowLogo(true)} /> Show the product logo</label>
            <label className="flex items-center gap-2"><input type="radio" name="logo" disabled={!canEdit} checked={!showLogo} onChange={() => setShowLogo(false)} /> Show the brand name only</label>
          </div>
        </div>
        <span className={fieldHint}>The logo comes from the product branding and sits at the top of every email. Saving stores a copy as a public image so every email app can load it. <Link className="text-accent hover:underline" href={brandingHref}>Change it in Settings</Link>, then save the layout again.</span>
      </div>
      <label className="block"><span className={label}>Footer (HTML)</span><RichTextarea mode="html" className="h-28 font-mono text-xs" value={v.footerHtml} maxLength={4000} disabled={!canEdit} onChange={(e) => setV({ ...v, footerHtml: e.target.value })} />
        <span className={fieldHint}>Only bold, italic, line breaks and https or mailto links are kept; anything else shows as plain text. Donexel adds the &quot;don&apos;t reply&quot; notice itself, so don&apos;t repeat it. Put the postal address here if you need one.</span></label>
      <label className="block"><span className={label}>Footer (plain text)</span><textarea className="input h-24 resize-y py-2 font-mono text-xs" value={v.footerText} maxLength={2000} disabled={!canEdit} onChange={(e) => setV({ ...v, footerText: e.target.value })} /></label>
      {error && <Notice tone="danger">{error}</Notice>}
      {canEdit
        ? <button className="btn btn-primary" disabled={pending || !dirty || !colourOk || !v.brandName.trim()}>{pending ? 'Saving…' : 'Save layout'}</button>
        : <p className="text-muted">Only admins can change the layout.</p>}
    </form>
    {previewKey && (
      <div>
        <div className="mb-1.5 text-sm font-medium">Preview</div>
        {preview && !preview.ok && <p role="alert" className="mb-2 text-sm text-danger">{preview.error}</p>}
        <iframe title="Layout preview" sandbox="" srcDoc={preview?.ok ? preview.preview.html : ''} className={clsx('block h-[480px] w-full rounded-xl border border-line bg-white', rendering ? 'preview-busy' : 'preview-ready')} />
        <p className="mt-2 text-xs text-muted">A sample email with your unsaved changes, in a sandboxed frame. Nothing is saved until you press Save layout.</p>
      </div>
    )}
    </div>
  );
}
