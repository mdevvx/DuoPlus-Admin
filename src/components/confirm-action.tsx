'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertTriangle, Check, KeyRound, ShieldCheck } from 'lucide-react';
import { ModalHeader } from './modal-header';
import { useToast } from './toast';

export interface ActionResultClient { ok: boolean; message?: string; error?: string; needsStepUp?: boolean; stepUpInvalid?: boolean }
interface Field {
  name: string; label: string; type?: 'number' | 'text' | 'select' | 'password'; min?: number; max?: number; placeholder?: string;
  options?: [string, string][]; defaultValue?: string; optional?: boolean;
}

const labelCls = 'mb-1.5 block text-[13px] font-medium';

/**
 * Confirmation dialog for mutations: extra fields, mandatory reason, typed confirmation and, when the
 * server says the MFA check is stale, an authenticator code. Everything the admin typed stays in place
 * while the dialog asks for the code or shows an error. All of it is re-validated server-side.
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
  const codeRef = useRef<HTMLInputElement>(null);
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'select' ? f.options?.[0]?.[0] ?? '' : '')]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm;
  const codeOk = !needsCode || /^\d{6}$/.test(code);

  // Move the cursor to the code box the moment it appears.
  useEffect(() => { if (needsCode) codeRef.current?.focus(); }, [needsCode]);

  function resetAll() {
    setValues(initial()); setReason(''); setTyped(''); setCode(''); setNeedsCode(false); setCodeError(null); setError(null); setInvalid({});
  }
  function close(reset = true) { ref.current?.close(); if (reset) resetAll(); }

  /** Inline validation (replaces the browser's native bubble). Returns true when everything required is filled. */
  function validate() {
    const bad: Record<string, string> = {};
    for (const f of fields) if (!f.optional && f.type !== 'select' && !(values[f.name] ?? '').trim()) bad[f.name] = 'This field is required.';
    if (reasonRequired && reason.trim().length < 5) bad.reason = 'Give a short reason (at least 5 characters).';
    setInvalid(bad);
    const first = Object.keys(bad)[0];
    if (first) ref.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return !first;
  }

  function submit() {
    setError(null); setCodeError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
    for (const f of fields) fd.set(f.name, values[f.name] ?? '');
    fd.set('reason', reason);
    if (typeToConfirm) fd.set('confirm', typed);
    if (needsCode || code) fd.set('code', code);
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast(true, res.message ?? 'Done');
        close();
        router.refresh();
      } else if (res.needsStepUp) {
        setNeedsCode(true);                       // show the code box; keep everything else as typed
        if (res.stepUpInvalid) { setCodeError(res.error ?? 'That code is not valid.'); setCode(''); codeRef.current?.focus(); }
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  const Icon = danger ? AlertTriangle : ShieldCheck;
  return (
    <>
      <button type="button" className={clsx('btn', small ? '' : 'h-9', danger && 'text-danger')} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog
        ref={ref}
        className="w-[500px] max-w-[92vw] overflow-hidden rounded-xl text-left border border-line bg-raised p-0 text-ink shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === ref.current && !pending) close(false); }}
        onCancel={(e) => { if (pending) e.preventDefault(); }}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (!pending && typedOk && codeOk && validate()) submit(); }}>
          <ModalHeader icon={Icon} tone={danger ? 'danger' : 'accent'} title={title} description={description} onClose={() => close(false)} />

          <div className="space-y-4 px-5 py-5">
            {fields.map((f) => (
              <label key={f.name} className="block">
                <span className={labelCls}>{f.label}{!f.optional && f.type !== 'select' && <span className="text-danger"> *</span>}</span>
                {f.type === 'select' ? (
                  <select className="input" value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                    {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input name={f.name} className={clsx('input', invalid[f.name] && 'border-danger')} type={f.type ?? 'text'} autoComplete={f.type === 'password' ? 'new-password' : 'off'} min={f.min} max={f.max} placeholder={f.placeholder}
                    value={values[f.name] ?? ''} onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setInvalid(({ [f.name]: _, ...r }) => r); }} aria-invalid={!!invalid[f.name]} />
                )}
                {invalid[f.name] && <span role="alert" className="mt-1 block text-[12.5px] text-danger">{invalid[f.name]}</span>}
              </label>
            ))}

            <label className="block">
              <span className={labelCls}>Reason{reasonRequired && <span className="text-danger"> *</span>} <span className="font-normal text-muted">{reasonRequired ? '· saved in the audit log' : '· optional'}</span></span>
              <textarea name="reason" className={clsx('input h-24 resize-none py-2', invalid.reason && 'border-danger')} value={reason} onChange={(e) => { setReason(e.target.value); setInvalid(({ reason: _, ...r }) => r); }} maxLength={500} aria-invalid={!!invalid.reason} placeholder="Why are you making this change?" />
              <span className="mt-1 flex justify-between text-[12.5px]">
                <span role={invalid.reason ? 'alert' : undefined} className="text-danger">{invalid.reason}</span>
                <span className="num text-muted">{reason.length}/500</span>
              </span>
            </label>

            {typeToConfirm && (
              <label className="block">
                <span className={labelCls}>Type <b className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">{typeToConfirm}</b> to confirm</span>
                <span className="relative block">
                  <input className="input pr-9" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                  {typedOk && typed && <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" aria-label="Matches" />}
                </span>
              </label>
            )}

            {needsCode && (
              <div className="rise rounded-lg border border-line bg-accent-soft p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent"><KeyRound className="h-[18px] w-[18px]" aria-hidden /></span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-accent">Confirm it&apos;s you</div>
                    <p className="mt-0.5 text-[13px] text-muted">For your security, enter the 6-digit code from your authenticator app. This action always needs a recent check.</p>
                  </div>
                </div>
                <input ref={codeRef} className={clsx('input num mt-3 h-11 text-center text-lg tracking-[0.5em]', codeError && 'border-danger')} value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError(null); }}
                  inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="••••••" aria-label="Authenticator code" aria-invalid={!!codeError} />
                {codeError && <p role="alert" className="mt-2 text-[13px] text-danger">{codeError} Try the current code from your app.</p>}
              </div>
            )}

            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">
            <button type="button" className="btn" onClick={() => close()} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending || !typedOk || !codeOk} className={clsx('btn min-w-[96px]', danger ? 'btn-danger' : 'btn-primary')}>
              {pending ? 'Working…' : needsCode ? 'Verify and confirm' : 'Confirm'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
