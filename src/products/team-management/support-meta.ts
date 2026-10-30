/** Plain values for the support queue, shared by the server page and the browser components. */
export const SUPPORT_STATUSES = ['open', 'answered', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = { open: 'Open', answered: 'Answered', closed: 'Closed' };
