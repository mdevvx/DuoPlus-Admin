import { Badge } from './ui';

/** SANDBOX (amber) or LIVE (green), so test money is never read as real revenue. */
export function PolarModeBadge({ sandbox }: { sandbox: boolean }) {
  return <Badge tone={sandbox ? 'warning' : 'success'}>{sandbox ? 'Sandbox' : 'Live'}</Badge>;
}
