'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { confirmEnrollment, startEnrollment, redeemRecoveryCode, verifyMfa, type FormState } from '../actions';

export function MfaChallenge() {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyMfa, {});
  const [rec, recAction, recPending] = useActionState<FormState, FormData>(redeemRecoveryCode, {});
  const [showRecovery, setShowRecovery] = useState(false);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input className="input num h-9 tracking-widest" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus aria-label="6-digit code" />
        {state.error && <p role="alert" className="text-danger">{state.error}</p>}
        <button className="btn btn-primary h-9 w-full" disabled={pending}>{pending ? 'Checking…' : 'Verify'}</button>
      </form>
      <button type="button" className="text-xs text-muted underline" onClick={() => setShowRecovery(!showRecovery)}>Lost your authenticator? Use a recovery code</button>
      {showRecovery && (
        <form action={recAction} className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">Using a recovery code removes your current authenticator so you can set up a new one.</p>
          <input className="input h-9 font-mono" name="recovery" placeholder="XXXXX-XXXXX" autoComplete="off" required />
          {rec.error && <p role="alert" className="text-danger">{rec.error}</p>}
          <button className="btn h-9 w-full" disabled={recPending}>Use recovery code</button>
        </form>
      )}
    </div>
  );
}

export function MfaEnroll() {
  const [setup, setSetup] = useState<FormState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState<FormState, FormData>(confirmEnrollment, {});

  if (state.recoveryCodes) {
    return (
      <div className="space-y-3">
        <p className="rounded bg-warning-soft px-3 py-2 text-warning" role="status">Save these 8 recovery codes now. Each works once, and they are not shown again.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono">{state.recoveryCodes.map((c) => <li key={c} className="rounded border border-line bg-canvas px-2 py-1">{c}</li>)}</ul>
        <Link className="btn w-full" href="/">I saved them — continue</Link>
      </div>
    );
  }
  if (!setup?.qr) {
    return (
      <div className="space-y-3">
        {setup?.error && <p role="alert" className="text-danger">{setup.error}</p>}
        <button className="btn btn-primary h-9 w-full" disabled={starting} onClick={() => startTransition(async () => setSetup(await startEnrollment()))}>
          {starting ? 'Preparing…' : 'Set up authenticator'}
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-muted">Scan this QR code with an authenticator app (1Password, Authy, Google Authenticator…), then enter the 6-digit code.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI SVG; next/image adds nothing here */}
      <img src={setup.qr} alt="Authenticator QR code" width={176} height={176} className="mx-auto rounded bg-white p-2" />
      <p className="break-all text-center font-mono text-xs text-muted">Manual key: {setup.secret}</p>
      <input type="hidden" name="factorId" value={setup.factorId} />
      <input className="input num h-9 tracking-widest" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required aria-label="6-digit code" />
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
      <button className="btn btn-primary h-9 w-full" disabled={pending}>{pending ? 'Checking…' : 'Verify and finish'}</button>
    </form>
  );
}
