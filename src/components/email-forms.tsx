'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreVersion, saveLayout, saveSchedule, toggleTemplate } from '@/products/disconotify/email-actions';
import { contrastOnWhite } from '@/products/disconotify/email/render';
import type { EmailLayout, EmailSchedule } from '@/products/disconotify/email/vars';
import { ConfirmAction } from './confirm-action';
import { useToast } from './toast';

const label = 'mb-1.5 block text-[13px] font-medium';

/** Turning automatic emails off asks first; turning them back on does not. */
export function TemplateToggle({ tplKey, enabled, disabled }: { tplKey: string; enabled: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (disabled) return <span className="text-muted">{enabled ? 'On' : 'Off'}</span>;
  if (enabled) {
    return <ConfirmAction label="Switch off" title="Switch off automatic emails" description="Customers will stop receiving this email. Manual sends of this template still work." action={toggleTemplate}
      hidden={{ key: tplKey, enabled: 'false' }} reasonRequired={false} />;
  }
  return (
    <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
      const fd = new FormData(); fd.set('key', tplKey); fd.set('enabled', 'true');
      const r = await toggleTemplate(fd);
      toast(r.ok, r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    })}>{pending ? 'Working…' : 'Switch on'}</button>
  );
}

export function RestoreButton({ tplKey, currentVersion, version }: { tplKey: string; currentVersion: number; version: number }) {
  return (
    <ConfirmAction label="Restore" title={`Restore version ${version}`} description="Copies that version's content into the template as a new version. Nothing is deleted from the history."
      reasonRequired={false} hidden={{}} action={(fd) => { void fd; return restoreVersion({ key: tplKey, currentVersion, version }); }} />
  );
}

function useSave<T>(fn: (v: T) => ReturnType<typeof saveLayout>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  return { pending, error, run: (v: T) => { setError(null); start(async () => { const r = await fn(v); if (r.ok) { toast(true, r.message); router.refresh(); } else setError(r.error); }); } };
}

export function LayoutForm({ initial }: { initial: EmailLayout }) {
  const [v, setV] = useState(initial);
  const s = useSave<EmailLayout>(saveLayout);
  const ratio = contrastOnWhite(v.accent_color);
  return (
    <form className="max-w-xl space-y-5" onSubmit={(e) => { e.preventDefault(); s.run(v); }}>
      <label className="block"><span className={label}>Brand name</span><input className="input" value={v.brand_name} maxLength={60} onChange={(e) => setV({ ...v, brand_name: e.target.value })} /></label>
      <label className="block"><span className={label}>Logo address <span className="font-normal text-muted">· https, shown up to 48 px tall; the brand name is its alt text</span></span>
        <input className="input" type="url" value={v.logo_url} placeholder="https://…/logo.png" onChange={(e) => setV({ ...v, logo_url: e.target.value })} /></label>
      <div>
        <span className={label}>Accent colour</span>
        <div className="flex items-center gap-3">
          <input aria-label="Pick colour" type="color" className="h-9 w-12 rounded border border-line bg-surface" value={/^#[0-9a-f]{6}$/i.test(v.accent_color) ? v.accent_color : '#5B6CF0'} onChange={(e) => setV({ ...v, accent_color: e.target.value })} />
          <input className="input w-32 font-mono" value={v.accent_color} maxLength={7} onChange={(e) => setV({ ...v, accent_color: e.target.value })} aria-label="Accent colour hex" />
          <span className={ratio >= 4.5 ? 'text-[13px] text-success' : 'text-[13px] text-warning'}>Contrast on white: {ratio.toFixed(1)}:1{ratio >= 4.5 ? '' : ' (below 4.5:1, link text may be hard to read)'}</span>
        </div>
      </div>
      <label className="block"><span className={label}>Footer (HTML)</span>
        <textarea className="input h-28 resize-y py-2 font-mono text-[12.5px]" value={v.footer_html} onChange={(e) => setV({ ...v, footer_html: e.target.value })} />
        <span className="mt-1 block text-[12px] text-muted">Put the company&apos;s postal address here (required in several countries). Variables allowed: support_email, brand_name. The unsubscribe link is added automatically to marketing emails.</span></label>
      <label className="block"><span className={label}>Footer (plain text)</span>
        <textarea className="input h-24 resize-y py-2 font-mono text-[12.5px]" value={v.footer_text} onChange={(e) => setV({ ...v, footer_text: e.target.value })} /></label>
      {s.error && <p role="alert" className="text-danger">{s.error}</p>}
      <button className="btn btn-primary" disabled={s.pending}>{s.pending ? 'Saving…' : 'Save layout'}</button>
    </form>
  );
}

const SCHEDULE_FIELDS: { key: keyof EmailSchedule; title: string; hint: string; min: number; max: number }[] = [
  { key: 'renewal_days_before', title: 'Renewal reminder: days before the charge', hint: '0 = never send the "payment coming up" email.', min: 0, max: 30 },
  { key: 'trial_reminder_every_days', title: 'Trial-ended reminders: days between emails', hint: 'Gap between reminders after a trial ends.', min: 1, max: 60 },
  { key: 'trial_reminder_max', title: 'Trial-ended reminders: how many in total', hint: '0 = none.', min: 0, max: 10 },
];

export function ScheduleForm({ initial, source, defaults }: { initial: EmailSchedule; source: Record<keyof EmailSchedule, 'setting' | 'default'>; defaults: EmailSchedule }) {
  const [v, setV] = useState<Record<keyof EmailSchedule, string>>({ renewal_days_before: String(initial.renewal_days_before), trial_reminder_every_days: String(initial.trial_reminder_every_days), trial_reminder_max: String(initial.trial_reminder_max) });
  const s = useSave<EmailSchedule>(saveSchedule);
  const parsed = Object.fromEntries(SCHEDULE_FIELDS.map((f) => [f.key, /^\d+$/.test(v[f.key]) ? Number(v[f.key]) : NaN])) as EmailSchedule;
  const bad = SCHEDULE_FIELDS.find((f) => !Number.isInteger(parsed[f.key]) || parsed[f.key] < f.min || parsed[f.key] > f.max);
  return (
    <form className="max-w-xl space-y-5" onSubmit={(e) => { e.preventDefault(); if (!bad) s.run(parsed); }}>
      {SCHEDULE_FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className={label}>{f.title}</span>
          <input className="input w-28" inputMode="numeric" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} aria-invalid={bad?.key === f.key} />
          <span className="mt-1 block text-[12px] text-muted">{f.hint} Whole number from {f.min} to {f.max}. Now in effect: {initial[f.key]} ({source[f.key] === 'setting' ? 'this setting' : `bot default ${defaults[f.key]}`}).</span>
        </label>
      ))}
      <p className="rounded-lg bg-accent-soft px-3.5 py-2.5 text-[13px]">Changes apply on the bot&apos;s next check, within about 10 minutes. Reminder counts already recorded per server are not changed.</p>
      {bad && <p role="alert" className="text-danger">{bad.title}: enter a whole number from {bad.min} to {bad.max}.</p>}
      {s.error && <p role="alert" className="text-danger">{s.error}</p>}
      <button className="btn btn-primary" disabled={s.pending || !!bad}>{s.pending ? 'Saving…' : 'Save schedule'}</button>
    </form>
  );
}
