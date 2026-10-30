'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2, LifeBuoy, Paperclip } from 'lucide-react';
import { closeTicketAction, loadTicketAction, replyTicketAction, type TicketResult } from '@/products/team-management/support-actions';
import type { SupportTicket } from '@/products/team-management/support-api';
import { SUPPORT_CATEGORY_LABEL, SUPPORT_SEVERITY_LABEL } from '@/products/team-management/support-meta';
import { fieldHint, fieldLabel as label, Notice } from './form';
import { ModalHeader } from './modal-header';
import { useToast } from './toast';
import { DetailRow } from './ui';

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const CONTEXT_LABEL: Record<string, string> = { page: 'Page', browser: 'Browser', screen: 'Screen', language: 'Language', timezone: 'Time zone' };

/** One ticket in a dialog: the conversation, the diagnostic context and, for admins, the reply form. The thread is loaded when it opens. */
export function SupportTicketButton({ ticket: t, canEdit }: { ticket: SupportTicket; canEdit: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<TicketResult | null>(null);
  const [loading, load] = useTransition();
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<'answered' | 'closed'>('answered');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const canReply = canEdit && t.status !== 'closed';
  const d = state?.ok ? state.ticket : null;
  const title = t.number ? `Support request #${t.number}` : 'Support request';

  function open() {
    ref.current?.showModal();
    load(async () => setState(await loadTicketAction(t.id)));
  }
  function send() {
    setError(null);
    start(async () => {
      const r = await replyTicketAction({ id: t.id, reply, status });
      if (r.ok) { toast(true, r.message); setReply(''); ref.current?.close(); router.refresh(); } else setError(r.error);
    });
  }
  function close() {
    setError(null);
    start(async () => {
      const r = await closeTicketAction(t.id);
      if (r.ok) { toast(true, r.message); ref.current?.close(); router.refresh(); } else setError(r.error);
    });
  }
  const context = d?.context ? Object.entries(d.context).filter(([, v]) => typeof v === 'string' && v) as [string, string][] : [];
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={open}>{canReply && t.status === 'open' ? 'Reply' : 'Details'}</button>
      <dialog ref={ref} className="w-[620px] max-w-[96vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={LifeBuoy} title={title} description={t.workspace?.name || undefined} onClose={() => ref.current?.close()} />
        <div className="thin-scroll max-h-[65vh] overflow-y-auto overflow-x-hidden px-5 py-4">
          <dl className="divide-y divide-line text-sm">
            <DetailRow label="Subject" copy={t.subject}>{t.subject || '—'}</DetailRow>
            <DetailRow label="From" copy={t.requester?.email}>{t.requester ? `${t.requester.fullName ? `${t.requester.fullName} · ` : ''}${t.requester.email}` : '—'}</DetailRow>
            <DetailRow label="Category">{t.category ? SUPPORT_CATEGORY_LABEL[t.category] ?? t.category : '—'}</DetailRow>
            <DetailRow label="Urgency">{t.severity ? SUPPORT_SEVERITY_LABEL[t.severity] ?? t.severity : '—'}</DetailRow>
            <DetailRow label="Sent">{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</DetailRow>
            <DetailRow label="Answer due">{t.dueAt ? new Date(t.dueAt).toLocaleString() : '—'}</DetailRow>
            {t.rating ? <DetailRow label="Rating">{t.rating} / 5{d?.ratingNote ? ` · ${d.ratingNote}` : ''}</DetailRow> : null}
          </dl>

          <div className="mt-4">
            <div className="mb-1.5 text-sm font-medium">Conversation</div>
            {loading && !state && <p className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
            {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}
            {d && d.messages.length === 0 && <p className="whitespace-pre-wrap break-words rounded-lg bg-subtle px-3 py-2 text-sm">{t.body || '—'}</p>}
            {d && (
              <ol className="space-y-2.5">
                {d.messages.map((m) => (
                  <li key={m.id} className={clsx('rounded-lg px-3 py-2 text-sm', m.fromSupport ? 'bg-accent-soft' : 'bg-subtle')}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                      <span className="font-medium text-ink">{m.fromSupport ? 'Support' : d.requester?.fullName || d.requester?.email || 'Requester'}</span>
                      <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.attachments.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {m.attachments.map((a) => (
                          <li key={a.url} className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                            <a className="truncate text-accent hover:underline" href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a><span className="shrink-0 text-muted">{kb(a.size)}</span></li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {d && d.messages.some((m) => m.attachments.length > 0) && <p className="mt-2 text-xs text-muted">Attachment links work for 10 minutes. Reopen this request for fresh ones.</p>}
          </div>

          {context.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium">Where they were</div>
              <dl className="divide-y divide-line text-sm">{context.map(([k, v]) => <DetailRow key={k} label={CONTEXT_LABEL[k] ?? k.charAt(0).toUpperCase() + k.slice(1)} copy={v}><span className="break-all">{v}</span></DetailRow>)}</dl>
            </div>
          )}

          {canReply && (
            <div className="mt-4 space-y-3">
              <label className="block"><span className={label}>{d && d.messages.some((m) => m.fromSupport) ? 'Another reply' : 'Your reply'}</span>
                <textarea className="input h-32 resize-y py-2" value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} />
                <span className={fieldHint}>The requester gets this as an in-app notification and an email.</span></label>
              <label className="block"><span className={label}>After sending</span>
                <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as 'answered' | 'closed')}>
                  <option value="answered">Mark as answered</option>
                  <option value="closed">Close the ticket</option>
                </select></label>
              {error && <Notice tone="danger">{error}</Notice>}
            </div>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t border-line bg-subtle px-5 py-3.5">
          {canReply && <button type="button" className="btn mr-auto" disabled={pending} onClick={close}>Close ticket without reply</button>}
          <button type="button" className="btn ml-auto" onClick={() => ref.current?.close()}>Dismiss</button>
          {canReply && <button type="button" className="btn btn-primary" disabled={pending || !reply.trim()} onClick={send}>{pending ? 'Sending…' : 'Send reply'}</button>}
        </footer>
      </dialog>
    </>
  );
}
