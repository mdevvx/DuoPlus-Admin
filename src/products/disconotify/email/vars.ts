import { z } from 'zod';

/** Template variables, shared by the editor, the validator and the preview. Anything else renders as empty. */
export interface VarDef { name: string; meaning: string; sample: string; url?: boolean }

export const VARIABLES: VarDef[] = [
  { name: 'server_name', meaning: 'Discord server name', sample: 'Gaming Hub' },
  { name: 'price', meaning: 'Monthly price', sample: '$1.99' },
  { name: 'trial_days', meaning: 'Trial length in days', sample: '7' },
  { name: 'trial_ends_at', meaning: 'When the trial ends', sample: 'October 29, 2026' },
  { name: 'paid_until', meaning: 'Paid until', sample: 'November 29, 2026' },
  { name: 'next_charge_date', meaning: 'Next card payment', sample: 'November 29, 2026' },
  { name: 'status_line', meaning: 'Ready-made sentence about the subscription state', sample: 'Your subscription is active until November 29, 2026.' },
  { name: 'subscribe_url', meaning: 'Subscribe page', sample: 'https://disconotify.com/subscribe', url: true },
  { name: 'activate_url', meaning: 'Trial activation page', sample: 'https://disconotify.com/activate', url: true },
  { name: 'manage_url', meaning: 'Manage or cancel page', sample: 'https://disconotify.com/manage', url: true },
  { name: 'unsubscribe_url', meaning: 'Unsubscribe link (marketing emails only, empty otherwise)', sample: 'https://disconotify.com/unsubscribe?t=sample', url: true },
  { name: 'support_email', meaning: 'Support address', sample: 'support@disconotify.com' },
  { name: 'reminder_number', meaning: 'Which reminder this is (1, 2, 3)', sample: '1' },
  { name: 'reminder_total', meaning: 'How many reminders in total', sample: '3' },
  { name: 'brand_name', meaning: 'Brand name from the layout', sample: 'DiscoNotify' },
];
export const VAR_NAMES = new Set(VARIABLES.map((v) => v.name));
/** Only these may be written with three braces (raw) and so be placed inside href="…". */
export const URL_VARS = new Set(VARIABLES.filter((v) => v.url).map((v) => v.name));

export type Sample = { id: string; label: string; values: Record<string, string> };
const base = Object.fromEntries(VARIABLES.map((v) => [v.name, v.sample]));
export const SAMPLES: Sample[] = [
  { id: 'normal', label: 'Normal', values: base },
  { id: 'long', label: 'Very long server name', values: { ...base, server_name: 'The Official Community Server For Competitive Gaming, Esports Tournaments And Weekly Watch Parties' } },
  { id: 'special', label: 'Special characters in name', values: { ...base, server_name: '<b>Tom & Jerry</b> "Fan" Club' } },
  { id: 'notrial', label: 'No trial date', values: { ...base, trial_ends_at: '', trial_days: '' } },
];

export type Category = 'transactional' | 'marketing';
export const CATEGORY_LABEL: Record<string, string> = { transactional: 'Billing', marketing: 'Reminder / marketing' };

/** The bot looks built-ins up by key and decides when to send them; the panel only shows this. */
export const BUILT_IN: Record<string, { trigger: string }> = {
  trial_activated: { trigger: 'Someone activates a server’s trial on the website.' },
  subscription_started: { trigger: 'A card subscription or crypto payment begins.' },
  subscription_cancelled: { trigger: 'A card subscription is cancelled.' },
  payment_failed: { trigger: 'A card payment fails (Polar retries it).' },
  renewal_reminder: { trigger: 'N days before the next card payment, or before a trial turns into the first charge. N is set under Email settings.' },
  subscription_renewed: { trigger: 'A card payment for the next month went through.' },
  subscription_ended: { trigger: 'A card subscription ended and alerts are paused.' },
  trial_ended_reminder: { trigger: 'After a free trial ends without a subscription: right away, then on the schedule in Email settings, at most 3 by default.' },
  subscription_lapsed_reminder: { trigger: 'The same series after a paid subscription runs out (and its grace period).' },
};

// ---- Layout & schedule (stored as JSON in notify_bot_state) ----

const httpsUrl = z.string().trim().max(500).refine((u) => u === '' || /^https:\/\/\S+$/i.test(u), 'Must start with https://');
export const layoutSchema = z.strictObject({
  brand_name: z.string().trim().min(1, 'Brand name is required').max(60),
  logo_url: httpsUrl,
  accent_color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #5B6CF0'),
  footer_html: z.string().max(2000),
  footer_text: z.string().max(1000),
});
export type EmailLayout = z.infer<typeof layoutSchema>;
export const DEFAULT_LAYOUT: EmailLayout = {
  brand_name: 'DiscoNotify', logo_url: '', accent_color: '#5B6CF0',
  footer_html: 'Questions? {{support_email}}', footer_text: 'Questions? {{support_email}}',
};

export const scheduleSchema = z.strictObject({
  renewal_days_before: z.number().int().min(0).max(30),
  trial_reminder_every_days: z.number().int().min(1).max(60),
  trial_reminder_max: z.number().int().min(0).max(10),
});
export type EmailSchedule = z.infer<typeof scheduleSchema>;
export const SCHEDULE_DEFAULTS: EmailSchedule = { renewal_days_before: 3, trial_reminder_every_days: 7, trial_reminder_max: 3 };

export const SUBJECT_MAX = 150;
export const PREHEADER_MAX = 200;
export const HTML_MAX = 100 * 1024;
