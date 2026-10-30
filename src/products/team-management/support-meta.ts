/** Plain values for the support queue, shared by the server page and the browser components. */
export const SUPPORT_STATUSES = ['open', 'answered', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_CATEGORIES = ['bug', 'billing', 'how_to', 'feature', 'account', 'other'] as const;
export const SUPPORT_CATEGORY_LABEL: Record<string, string> = { bug: 'Bug', billing: 'Billing', how_to: 'How to', feature: 'Feature request', account: 'Account', other: 'Other' };
export const SUPPORT_SEVERITIES = ['low', 'normal', 'high', 'critical'] as const;
export const SUPPORT_SEVERITY_LABEL: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };
export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = { open: 'Open', answered: 'Answered', closed: 'Closed' };
