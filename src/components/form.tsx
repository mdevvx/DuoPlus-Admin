import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Text roles for forms and dialogs, so every screen uses the same sizes (the panel's scale: 14px text, 13px labels,
 * 12px hints). Use these instead of writing sizes by hand.
 */
export const fieldLabel = 'mb-1.5 block text-sm font-medium';
export const fieldHint = 'mt-1.5 block text-xs text-muted';
export const fieldError = 'mt-1.5 block text-xs text-danger';

const NOTICE = {
  info: 'bg-accent-soft text-ink',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;

/** A short message box inside a page, card or dialog. */
export function Notice({ tone = 'info', children, role }: { tone?: keyof typeof NOTICE; children: ReactNode; role?: 'alert' | 'status' }) {
  return <p role={role ?? (tone === 'danger' ? 'alert' : undefined)} className={clsx('rounded-lg px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]', NOTICE[tone])}>{children}</p>;
}
