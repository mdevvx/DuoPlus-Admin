export type SubState = 'whitelisted' | 'card_past_due' | 'active_card' | 'active_crypto' | 'trial' | 'lapsed' | 'bot_removed';

export interface BillingLike {
  trial_ends_at?: string | null;
  paid_until?: string | null;
  whitelisted?: boolean | null;
  card_subscription_id?: string | null;
  card_status?: string | null;
}

/** Single place that decides what "state" a server is in. Filters in queries/servers.ts mirror this. */
export function subscriptionState(b: BillingLike, botPresent: boolean | null | undefined, now = Date.now()): SubState {
  if (botPresent === false) return 'bot_removed';
  if (b.whitelisted) return 'whitelisted';
  if (b.card_status === 'past_due') return 'card_past_due';
  const paid = b.paid_until ? new Date(b.paid_until).getTime() > now : false;
  if (paid) return b.card_subscription_id ? 'active_card' : 'active_crypto';
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
