'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import { addWhitelistEntry } from '@/products/team-management/actions';
import { EMAIL_RE } from '@/products/team-management/labels';
import { fieldError, fieldLabel as label, Notice } from './form';
import { useToast } from './toast';

const PLAN_OPTIONS: [string, string][] = [['starter', 'Starter'], ['growth', 'Growth'], ['scale', 'Scale']];
interface Done { email: string; plan: string; workspaces: number; activeSubscription: boolean }

/**
 * Add an email to the billing whitelist. Shows the outcome right here and keeps the warning on screen:
 * a person who already pays through Polar keeps being charged until the subscription is cancelled in Polar.
 */
export function WhitelistAdd({ polarUrl }: { polarUrl: string }) {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('scale');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const emailOk = EMAIL_RE.test(email.trim());
  const reasonOk = reason.trim().length >= 5;

  function submit() {
    setTouched(true); setError(null);
    if (!emailOk || !reasonOk) return;
    const fd = new FormData();
    fd.set('email', email.trim()); fd.set('plan', plan); fd.set('note', note); fd.set('reason', reason);
    if (code) fd.set('code', code);
    start(async () => {
      const res = await addWhitelistEntry(fd);
      if (res.ok && res.result) {
        toast(true, res.message);
        setDone({ email: res.result.email || email.trim().toLowerCase(), plan: res.result.plan || plan, workspaces: res.result.workspaces, activeSubscription: res.result.activeSubscription });
        setEmail(''); setNote(''); setReason(''); setCode(''); setNeedsCode(false); setTouched(false);
        router.refresh(); // soft refresh: the table below picks up the new entry
      } else if (!res.ok && res.needsStepUp) {
        setNeedsCode(true);
        if (res.stepUpInvalid) setError(res.error);
      } else if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <form noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_180px_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); if (!pending) submit(); }}>
        <label className="block">
          <span className={label}>Email <span className="text-danger">*</span></span>
          <input className={clsx('input', touched && !emailOk && 'border-danger')} type="email" autoComplete="off" value={email} placeholder="friend@example.com" onChange={(e) => setEmail(e.target.value)} aria-invalid={touched && !emailOk} />
          {touched && !emailOk && <span role="alert" className={fieldError}>Enter a full email address. Domains and wildcards are not supported.</span>}
        </label>
        <label className="block">
          <span className={label}>Plan</span>
          <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLAN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="block">
          <span className={label}>Note <span className="font-normal text-muted">· optional</span></span>
          <input className="input" value={note} maxLength={300} placeholder="Partner, friend, internal…" onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="block lg:col-span-2">
          <span className={label}>Reason <span className="text-danger">*</span> <span className="font-normal text-muted">· saved in the audit log</span></span>
          <input className={clsx('input', touched && !reasonOk && 'border-danger')} value={reason} maxLength={500} placeholder="Why is this person exempt from billing?" onChange={(e) => setReason(e.target.value)} aria-invalid={touched && !reasonOk} />
          {touched && !reasonOk && <span role="alert" className={fieldError}>Give a short reason (at least 5 characters).</span>}
        </label>
        {needsCode && (
          <label className="block">
            <span className={label}>Authenticator code</span>
            <input className="input num text-center tracking-[0.4em]" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3 lg:col-span-3">
          <button className="btn btn-primary" disabled={pending || (needsCode && code.length !== 6)}>{pending ? 'Adding…' : needsCode ? 'Verify and add' : 'Add to whitelist'}</button>
          <span className="text-xs text-muted">Adding an email that already exists updates its plan and note. Their existing workspaces become complimentary immediately.</span>
        </div>
      </form>

      {error && <Notice tone="danger">{error}</Notice>}

      {done && (
        <div className="space-y-3" role="status">
          <Notice tone="info">
            <b>{done.email}</b> is on the whitelist ({PLAN_OPTIONS.find(([v]) => v === done.plan)?.[1] ?? done.plan}).{' '}
            {done.workspaces === 0 ? 'They have no workspaces yet. Any workspace they create will be complimentary.' : <><b>{done.workspaces}</b> existing workspace{done.workspaces === 1 ? ' is' : 's are'} now complimentary.</>}
          </Notice>
          {done.activeSubscription && (
            <div className="rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning" role="alert">
              <b>They still have a paid Polar subscription.</b> Cancel it in Polar or they will keep being charged.
              <a className="ml-3 inline-flex items-center gap-1 font-medium underline" href={polarUrl} target="_blank" rel="noopener noreferrer">Open Polar <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
