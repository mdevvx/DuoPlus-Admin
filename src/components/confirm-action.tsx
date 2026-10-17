'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useToast } from './toast';

export interface ActionResultClient { ok: boolean; message?: string; error?: string; needsStepUp?: boolean }
interface Field {
  name: string; label: string; type?: 'number' | 'text' | 'select' | 'password'; min?: number; max?: number; placeholder?: string;
  options?: [string, string][]; defaultValue?: string; optional?: boolean;
}

/**
 * Confirmation dialog for mutations: extra fields, mandatory reason, typed confirmation and
 * (when the server says the MFA challenge is stale) an authenticator code. All of it is re-validated server-side.
 */
export function ConfirmAction({
  label, title, description, action, hidden, fields = [], typeToConfirm, reasonRequired = true, danger = false, small = true,
}: {
  label: string; title: string; description?: string;
  action: (fd: FormData) => Promise<ActionResultClient>;
  hidden: Record<string, string>;
  fields?: Field[];
  /** The exact text the admin must type (e.g. the server name). */
  typeToConfirm?: string;
  reasonRequired?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [typed, setTyped] = useState('');
  const toast = useToast();
  const router = useRouter();
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm;

  function close() { ref.current?.close(); setError(null); setTyped(''); }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast(true, res.message ?? 'Done');
        close();
        setNeedsCode(false);
        router.refresh();
      } else {
        if (res.needsStepUp) setNeedsCode(true);
        setError(res.error ?? 'Failed');
      }
    });
  }

  return (
    <>
      <button type="button" className={clsx('btn', small ? '' : 'h-9', danger && 'text-danger')} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="w-[480px] rounded-xl border border-line bg-raised p-0 text-ink shadow-pop backdrop:bg-black/50" onClose={() => setError(null)}>
        <form action={submit} className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', danger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent')}>
              {danger ? <AlertTriangle className="h-[18px] w-[18px]" aria-hidden /> : <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />}
            </span>
            <h3 className="pt-1.5 text-base font-semibold">{title}</h3>
          </div>
          {description && <p className="text-muted">{description}</p>}
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-xs text-muted">{f.label}</span>
              {f.type === 'select' ? (
                <select className="input" name={f.name} defaultValue={f.defaultValue}>
                  {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input className="input" name={f.name} type={f.type ?? 'text'} autoComplete={f.type === 'password' ? 'new-password' : undefined} min={f.min} max={f.max} placeholder={f.placeholder} defaultValue={f.defaultValue} required={!f.optional} />
              )}
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Reason {reasonRequired ? '(required, saved in the audit log)' : '(optional)'}</span>
            <textarea className="input h-16 py-1.5" name="reason" required={reasonRequired} minLength={reasonRequired ? 5 : undefined} maxLength={500} />
          </label>
          {typeToConfirm && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Type <b className="text-ink">{typeToConfirm}</b> to confirm</span>
              <input className="input" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          )}
          {needsCode && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Authenticator code (your last check was over 10 minutes ago)</span>
              <input className="input num" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required />
            </label>
          )}
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" disabled={pending || !typedOk} className={clsx('btn', danger ? 'btn-danger' : 'btn-primary')}>
              {pending ? 'Working…' : 'Confirm'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
