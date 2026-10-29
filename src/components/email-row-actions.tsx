'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addContact, batchStatus, cancelBatch, cancelEmail, eraseAddress, removeContact, retryEmail, revealContact, revealOutboxEmail, setMarketing } from '@/products/disconotify/email-actions';
import { CopyButton } from './small-client';
import { ConfirmAction } from './confirm-action';
import { ChevronDown, Download } from 'lucide-react';
import { Card, Stat } from './ui';
import { usePopupFit } from './popup-fit';

type Status = Awaited<ReturnType<typeof batchStatus>>;

export function OutboxActions({ id, status, canAct }: { id: string; status: string; canAct: boolean }) {
  if (!canAct) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {status === 'failed' && <ConfirmAction label="Retry" title="Retry this email" description="Queues it again right away with the attempt counter reset." reasonRequired={false} compact action={retryEmail} hidden={{ id }} />}
      {status === 'queued' && <ConfirmAction label="Cancel" title="Cancel this email" description="It will not be sent." reasonRequired={false} danger compact action={cancelEmail} hidden={{ id }} />}
    </span>
  );
}

const TONE: [string, string][] = [['queued', 'Queued'], ['sending', 'Sending'], ['sent', 'Sent'], ['failed', 'Failed'], ['skipped', 'Skipped']];

/** Live counts for one manual send, refreshed every 5 seconds until nothing is left to send. */
export function BatchProgress({ batch, initial }: { batch: string; initial: Status }) {
  const [s, setS] = useState<Status>(initial);
  const active = s.ok && s.counts.queued + s.counts.sending > 0;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void batchStatus(batch).then((r) => { if (r.ok) setS(r); }); }, 5000);
    return () => clearInterval(t);
  }, [active, batch]);
  if (!s.ok) return <p role="alert" className="text-danger">Could not load the progress.</p>;
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TONE.map(([k, l]) => (
          <Card key={k}><Stat label={l} value={s.counts[k as keyof typeof s.counts]} /></Card>
        ))}
      </div>
      <p className="text-sm text-muted">
        {s.total} email{s.total === 1 ? '' : 's'} in this send.
        {active ? ' The bot picks queued emails up about once a minute.' : ' Nothing is waiting any more.'}
        {s.nextSend && new Date(s.nextSend).getTime() > Date.now() + 60_000 && <> Scheduled for {new Date(s.nextSend).toLocaleString()}.</>}
      </p>
      {s.reasons.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Why some were not sent</div>
          <ul className="space-y-1 text-sm">{s.reasons.map(([r, n]) => <li key={r}><b className="num">{n}</b> · {r}</li>)}</ul>
        </div>
      )}
      {s.counts.queued > 0 && <ConfirmAction label="Cancel queued emails" title="Cancel the queued emails" description="Only emails that have not been picked up yet are cancelled." reasonRequired={false} danger small={false} action={cancelBatch} hidden={{ id: batch }} />}
    </div>
  );
}

/** Masked address with a Reveal link. Showing the full address is written to the audit log; once shown it can be copied. */
export function RevealAddress({ id, masked, kind = 'contact' }: { id: string; masked: string; kind?: 'contact' | 'outbox' }) {
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  if (shown) return <span className="inline-flex items-center gap-1.5"><span>{shown}</span><CopyButton value={shown} label="Copy address" /></span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span>{masked}</span>
      <button type="button" className="text-xs text-accent hover:underline" disabled={pending} title="Showing a full address is written to the audit log"
        onClick={() => start(async () => { const r = await (kind === 'outbox' ? revealOutboxEmail(id) : revealContact(id)); if (r.ok) setShown(r.email); else setErr(true); })}>{err ? 'Failed, try again' : pending ? 'Loading…' : 'Reveal'}</button>
    </span>
  );
}

export function ContactActions({ id, unsubscribed, owner, canAct }: { id: string; unsubscribed: boolean; owner: boolean; canAct: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {owner && (unsubscribed
        ? <ConfirmAction label="Re-subscribe" title="Re-subscribe to marketing emails" description="Only do this if the person asked you to." compact action={setMarketing} hidden={{ id, op: 'resubscribe' }} />
        : <ConfirmAction label="Unsubscribe" title="Unsubscribe from marketing emails" description="Done on the person's behalf. They will no longer get reminders." compact action={setMarketing} hidden={{ id, op: 'unsubscribe' }} />)}
      {canAct && <ConfirmAction label="Remove" title="Remove this contact" description="The address stops receiving emails for this server." reasonRequired={false} danger compact action={removeContact} hidden={{ id }} />}
    </span>
  );
}

export function AddContact({ guildId }: { guildId?: string }) {
  return (
    <ConfirmAction label="Add contact" title="Add a contact" description="Adds an address to a server, with source “manual”." small={false} reasonRequired={false} action={addContact} hidden={guildId ? { guildId } : {}}
      fields={[...(guildId ? [] : [{ name: 'guildId', label: 'Server ID', placeholder: '1234567890123456789' }]), { name: 'email', label: 'Email address', placeholder: 'name@example.com' }]} />
  );
}

export function EraseAddress() {
  return (
    <ConfirmAction label="Delete an address everywhere" title="Delete this address everywhere" danger small={false} action={eraseAddress} hidden={{}}
      description="Deletes the address from every server's contacts and from the outbox. This cannot be undone."
      fields={[{ name: 'email', label: 'Email address' }, { name: 'confirm', label: 'Type the address again to confirm' }]} />
  );
}

/** One Export button with the two choices inside, instead of a button per choice in the page header. */
export function ExportMenu({ items }: { items: { label: string; hint: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = usePopupFit<HTMLDivElement>(open);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Download className="h-4 w-4" aria-hidden /> Export <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div ref={list} role="menu" className="pop-in absolute right-0 top-[calc(100%+4px)] z-30 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {items.map((i) => (
            <a key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-subtle">
              <span className="block text-sm font-medium">{i.label}</span>
              <span className="block text-xs text-muted">{i.hint}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
