'use client';

import { useRef, useState, useTransition } from 'react';
import { Loader2, Users } from 'lucide-react';
import { loadWorkspaceMembers } from '@/products/team-management/actions';
import type { Member } from '@/products/team-management/api';
import { humanize } from '@/products/team-management/labels';
import { CopyButton } from './small-client';
import { ModalHeader } from './modal-header';
import { Notice } from './form';

const ROLE_ORDER = ['admin', 'manager', 'member', 'guest'];
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

/** The member count of a workspace; opening it loads and lists the people in that workspace. */
export function WorkspacePeople({ id, name, members, seatLimit }: { id: string; name: string; members: number; seatLimit: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ list: Member[] } | { error: string; unsupported?: boolean } | null>(null);
  const [pending, start] = useTransition();

  function open() {
    ref.current?.showModal();
    start(async () => {
      const r = await loadWorkspaceMembers(id);
      setState(r.ok ? { list: [...r.members].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.email.localeCompare(b.email)) } : { error: r.error, unsupported: r.unsupported });
    });
  }

  return (
    <>
      <button type="button" onClick={open} title={`See the people in ${name}`} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-subtle hover:text-accent">
        <Users className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span className="num">{members}{seatLimit > 0 && <span className="text-muted"> / {seatLimit}</span>}</span>
      </button>
      <dialog ref={ref} className="w-[640px] max-w-[94vw] overflow-hidden rounded-xl border border-line bg-raised p-0 text-left text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ModalHeader icon={Users} title={`People in ${name}`} description={seatLimit > 0 ? `${members} of ${seatLimit} seats in use` : `${members} people`} onClose={() => ref.current?.close()} />
        <div className="thin-scroll max-h-[60vh] overflow-y-auto px-5 py-4">
          {pending && !state && <p className="flex items-center gap-2 text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading people…</p>}
          {state && 'error' in state && (
            <Notice tone={state.unsupported ? 'info' : 'danger'}>
              {state.error}{state.unsupported && <> Add <b>GET /api/v1/admin/users</b> to its operator API and this list fills in.</>}
            </Notice>
          )}
          {state && 'list' in state && (state.list.length === 0 ? <p className="text-muted">Nobody is listed in this workspace.</p> : (
            <ul className="divide-y divide-line">
              {state.list.map((m) => (
                <li key={m.id || m.email} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{(m.fullName || m.email || '?').charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.fullName || m.email}</span>
                    {m.fullName && <span className="block truncate text-xs text-muted">{m.email}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="block font-medium">{humanize(m.role)}</span>
                    <span className="block text-muted">{m.createdAt ? `Signed up ${when(m.createdAt)}` : ''}</span>
                  </span>
                  {m.email && <CopyButton value={m.email} label="Copy email" />}
                </li>
              ))}
            </ul>
          ))}
          {state && 'list' in state && state.list.length < members && <p className="mt-3 text-xs text-muted">{members - state.list.length} more {members - state.list.length === 1 ? 'seat is' : 'seats are'} counted for this workspace but not listed, for example pending invites.</p>}
        </div>
        <footer className="flex justify-end border-t border-line bg-subtle px-5 py-3.5"><button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Close</button></footer>
      </dialog>
    </>
  );
}
