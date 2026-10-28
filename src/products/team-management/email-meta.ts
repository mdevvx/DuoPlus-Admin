/**
 * Plain values about Donexel's email that both the server pages and the browser components need.
 * Kept free of server-only code so client components can import it.
 */
export const CATEGORY_ORDER = ['account', 'billing', 'reminder'] as const;
export const CATEGORY_LABEL: Record<string, string> = { account: 'Account', billing: 'Billing', reminder: 'Reminders' };

/** Turning these off can lock people out of their account. */
export const ACCOUNT_CRITICAL = new Set(['signup_confirm', 'password_reset', 'invitation']);

export const OUTBOX_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export const OUTBOX_SOURCES = ['system', 'reminder', 'manual'] as const;
