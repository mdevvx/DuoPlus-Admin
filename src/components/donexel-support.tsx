'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { replyTicketAction } from '@/products/team-management/support-actions';
import type { SupportTicket } from '@/products/team-management/support-api';
import { fieldHint, fieldLabel as label, Notice } from './form';
import { ModalHeader } from './modal-header';
import { useToast } from './toast';
import { DetailRow } from './ui';

/** One ticket in a dialog: the request, any earlier answer and, for admins, the reply form. */
export function SupportTicketButton({ ticket: t, canEdit }: { ticket: SupportTicket; canEdit: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<'answered' | 'closed'>('answered');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const canReply = canEdit && t.status !== 'closed';

  function send() {
    setError(null);
    start(async () => {
      const r = await replyTicketAction({ id: t.id, reply, status });
      if (r.ok) { toast(true, r.message); setReply(''); ref.current?.close(); router.refresh(); } else setError(r.error);
    });
  }
  return (
    <>
      <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => ref.current?.showModal()}>{canReply && t.status === 'open' ? 'Reply' : 'Details'}</button>
      <dialog ref={ref} className="w-[560px] max-w-[96vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={LifeBuoy} title="Support request" description={t.workspace?.name || undefined} onClose={() => ref.current?.close()} />
        <div className="thin-scroll max-h-[65vh] overflow-y-auto overflow-x-hidden px-5 py-4">
          <dl className="divide-y divide-line text-sm">
            <DetailRow label="Subject" copy={t.subject}>{t.subject || '—'}</DetailRow>
            <DetailRow label="From" copy={t.requester?.email}>{t.requester ? `${t.requester.fullName ? `${t.requester.fullName} · ` : ''}${t.requester.email}` : '—'}</DetailRow>
            <DetailRow label="Sent">{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</DetailRow>
            <DetailRow label="Answer due">{t.dueAt ? new Date(t.dueAt).toLocaleString() : '—'}</DetailRow>
          </dl>
          <div className="mt-4">
            <div className="mb-1.5 text-sm font-medium">Message</div>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-subtle px-3 py-2 text-sm">{t.body || '—'}</p>
          </div>
          {t.reply && (
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium">Our reply{t.repliedAt ? ` · ${new Date(t.repliedAt).toLocaleString()}` : ''}</div>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-accent-soft px-3 py-2 text-sm">{t.reply}</p>
            </div>
          )}
          {canReply && (
            <div className="mt-4 space-y-3">
              <label className="block"><span className={label}>{t.reply ? 'Another reply' : 'Your reply'}</span>
                <textarea className="input h-36 resize-y py-2" value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} />
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
        <footer className="flex justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Close</button>
          {canReply && <button type="button" className="btn btn-primary" disabled={pending || !reply.trim()} onClick={send}>{pending ? 'Sending…' : 'Send reply'}</button>}
        </footer>
      </dialog>
    </>
  );
}
