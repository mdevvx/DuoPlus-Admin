import { polarDashboardUrl } from '@/lib/polar-hosts';

/** The plan as the bot computes it (view notify_guild_plans). The panel never re-derives it from dates when the view has spoken. */
export type Plan = 'free' | 'paid' | 'grace' | 'whitelisted';
export const PLANS: readonly Plan[] = ['free', 'paid', 'grace', 'whitelisted'];

export type SubState = 'free' | 'paid_card' | 'paid_crypto' | 'grace' | 'whitelisted' | 'card_past_due' | 'bot_removed';

/** Keep equal to the bot's BILLING_GRACE_DAYS and the 3 grace days built into the view. Only the fallback below uses it. */
export const GRACE_DAYS = 3;

export interface BillingLike {
  /** The view's plan. When present it wins over anything derived from dates. */
  plan?: string | null;
  paid_until?: string | null;
  whitelisted?: boolean | null;
  card_subscription_id?: string | null;
  card_status?: string | null;
  has_card_subscription?: boolean | null;
}

const isPlan = (v: unknown): v is Plan => typeof v === 'string' && (PLANS as readonly string[]).includes(v);

/** Plan from dates, for rows that did not come from the view (the view is the source of truth everywhere else). */
export function planFromBilling(b: BillingLike, now = Date.now()): Plan {
  if (isPlan(b.plan)) return b.plan;
  if (b.whitelisted) return 'whitelisted';
  const until = b.paid_until ? new Date(b.paid_until).getTime() : NaN;
  if (Number.isNaN(until)) return 'free';
  if (until > now) return 'paid';
  return until + GRACE_DAYS * 86400000 > now ? 'grace' : 'free';
}

/** Single place that decides what badge a server shows. */
export function subscriptionState(b: BillingLike, botPresent: boolean | null | undefined, now = Date.now()): SubState {
  if (botPresent === false) return 'bot_removed';
  const plan = planFromBilling(b, now);
  if (plan === 'whitelisted') return 'whitelisted';
  if (b.card_status === 'past_due') return 'card_past_due';
  if (plan === 'paid') return b.card_subscription_id || b.has_card_subscription ? 'paid_card' : 'paid_crypto';
  return plan;
}

export const STATE_LABEL: Record<SubState, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  free: { label: 'Free', tone: 'neutral' },
  paid_card: { label: 'Paid · card', tone: 'success' },
  paid_crypto: { label: 'Paid · crypto', tone: 'success' },
  grace: { label: 'Grace', tone: 'warning' },
  whitelisted: { label: 'Whitelisted', tone: 'info' },
  card_past_due: { label: 'Card past due', tone: 'danger' },
  bot_removed: { label: 'Bot removed', tone: 'neutral' },
};

/** An account the bot keeps switched off because the server is on the free plan and over its limit. */
export function pausedByPlan(account: Record<string, unknown> | null | undefined): boolean {
  return account?.paused_by_plan === true;
}

/** Maintenance flag as stored in notify_bot_state: true | "true" | {enabled: true}. */
export function parseFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (v && typeof v === 'object' && 'enabled' in v) return parseFlag((v as { enabled: unknown }).enabled);
  return false;
}

/** Link to a Polar subscription, built only from the stored id. */
export function polarLink(subscriptionId: string | null | undefined, orgSlug: string | undefined, sandbox = false): string | null {
  if (!subscriptionId || !/^[\w-]{6,64}$/.test(subscriptionId)) return null;
  return polarDashboardUrl(sandbox, orgSlug, `/sales/subscriptions/${subscriptionId}`);
}
