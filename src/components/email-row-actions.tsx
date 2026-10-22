'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { addContact, batchStatus, cancelBatch, cancelEmail, eraseAddress, removeContact, retryEmail, revealContact, setMarketing } from '@/products/disconotify/email-actions';
import { ConfirmAction } from './confirm-action';

type Status = Awaited<ReturnType<typeof batchStatus>>;

export function OutboxActions({ id, status, canAgain, base, canAct }: { id: string; status: string; canAgain: boolean; base: string; canAct: boolean }) {
  if (!canAct) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {status === 'failed' && <ConfirmAction label="Retry" title="Retry this email" description="Queues it again right away with the attempt counter reset." reasonRequired={false} action={retryEmail} hidden={{ id }} />}
      {status === 'queued' && <ConfirmAction label="Cancel" title="Cancel this email" description="It will not be sent." reasonRequired={false} danger action={cancelEmail} hidden={{ id }} />}
      {canAgain && <Link className="btn h-7 px-2.5 text-xs" href={`${base}/email/send?again=${encodeURIComponent(id)}`}>Send again</Link>}
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
          <div key={k} className="card p-3"><div className="text-xs text-muted">{l}</div><div className="num text-2xl font-semibold">{s.counts[k as keyof typeof s.counts]}</div></div>
        ))}
      </div>
      <p className="text-[13px] text-muted">
        {s.total} email{s.total === 1 ? '' : 's'} in this send.
        {active ? ' The bot picks queued emails up about once a minute.' : ' Nothing is waiting any more.'}
        {s.nextSend && new Date(s.nextSend).getTime() > Date.now() + 60_000 && <> Scheduled for {new Date(s.nextSend).toLocaleString()}.</>}
      </p>
      {s.reasons.length > 0 && (
        <div>
          <div className="mb-1 text-[13px] font-medium">Why some were not sent</div>
          <ul className="space-y-1 text-[13px]">{s.reasons.map(([r, n]) => <li key={r}><b className="num">{n}</b> · {r}</li>)}</ul>
        </div>
      )}
      {s.counts.queued > 0 && <ConfirmAction label="Cancel queued emails" title="Cancel the queued emails" description="Only emails that have not been picked up yet are cancelled." reasonRequired={false} danger small={false} action={cancelBatch} hidden={{ id: batch }} />}
    </div>
  );
}

export function RevealAddress({ id, masked }: { id: string; masked: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  if (shown) return <span className="font-mono text-[13px]">{shown}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span>{masked}</span>
      <button type="button" className="text-[12px] text-accent hover:underline" disabled={pending} title="Showing a full address is written to the audit log"
        onClick={() => start(async () => { const r = await revealContact(id); if (r.ok) setShown(r.email); else setErr(true); })}>{err ? 'Failed' : pending ? '…' : 'Reveal'}</button>
    </span>
  );
}

export function ContactActions({ id, unsubscribed, owner, canAct }: { id: string; unsubscribed: boolean; owner: boolean; canAct: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {owner && (unsubscribed
        ? <ConfirmAction label="Re-subscribe" title="Re-subscribe to marketing emails" description="Only do this if the person asked you to." action={setMarketing} hidden={{ id, op: 'resubscribe' }} />
        : <ConfirmAction label="Unsubscribe" title="Unsubscribe from marketing emails" description="Done on the person's behalf. They will no longer get reminders." action={setMarketing} hidden={{ id, op: 'unsubscribe' }} />)}
      {canAct && <ConfirmAction label="Remove" title="Remove this contact" description="The address stops receiving emails for this server." reasonRequired={false} danger action={removeContact} hidden={{ id }} />}
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
