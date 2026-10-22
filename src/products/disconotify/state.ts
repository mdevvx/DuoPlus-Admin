export type SubState = 'whitelisted' | 'card_past_due' | 'active_card' | 'active_crypto' | 'trial' | 'lapsed' | 'bot_removed' | 'new' | 'not_activated';

export interface BillingLike {
  /** Set for servers that exist in the guilds table but have no billing row yet (the bot creates it on first use). */
  no_billing?: boolean;
  trial_ends_at?: string | null;
  paid_until?: string | null;
  whitelisted?: boolean | null;
  card_subscription_id?: string | null;
  card_status?: string | null;
  /** Set until the admin starts the trial on the website; alerts stay paused until then. */
  activation_required?: boolean | null;
}

/** Single place that decides what "state" a server is in. Filters in queries/servers.ts mirror this. */
export function subscriptionState(b: BillingLike, botPresent: boolean | null | undefined, now = Date.now()): SubState {
  if (botPresent === false) return 'bot_removed';
  if (b.no_billing) return 'new';
  if (b.whitelisted) return 'whitelisted';
  if (b.card_status === 'past_due') return 'card_past_due';
  const paid = b.paid_until ? new Date(b.paid_until).getTime() > now : false;
  if (paid) return b.card_subscription_id ? 'active_card' : 'active_crypto';
  if (b.activation_required && !b.trial_ends_at) return 'not_activated';
  const trial = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() > now : false;
  return trial ? 'trial' : 'lapsed';
}

export const STATE_LABEL: Record<SubState, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  whitelisted: { label: 'Whitelisted', tone: 'info' },
  card_past_due: { label: 'Card past due', tone: 'danger' },
  active_card: { label: 'Active · card', tone: 'success' },
  active_crypto: { label: 'Active · crypto', tone: 'success' },
  trial: { label: 'Trial', tone: 'warning' },
  lapsed: { label: 'Lapsed', tone: 'neutral' },
  bot_removed: { label: 'Bot removed', tone: 'neutral' },
  new: { label: 'New · no billing yet', tone: 'info' },
  not_activated: { label: 'Not activated', tone: 'warning' },
};

/** Maintenance flag as stored in notify_bot_state: true | "true" | {enabled: true}. */
export function parseFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (v && typeof v === 'object' && 'enabled' in v) return parseFlag((v as { enabled: unknown }).enabled);
  return false;
}

/** Link to a Polar subscription, built only from the stored id. */
export function polarLink(subscriptionId: string | null | undefined, orgSlug: string | undefined, sandbox = false): string | null {
  const host = sandbox ? 'https://sandbox.polar.sh' : 'https://polar.sh';
  if (!subscriptionId || !/^[\w-]{6,64}$/.test(subscriptionId)) return null;
  return orgSlug && /^[\w-]+$/.test(orgSlug)
    ? `${host}/dashboard/${orgSlug}/sales/subscriptions/${subscriptionId}`
    : `${host}/dashboard`;
}
