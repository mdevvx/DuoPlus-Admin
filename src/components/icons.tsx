import { Bell, LayoutDashboard, Server, Users, CreditCard, HeartPulse, Mail, Activity, ScrollText, Settings, Box, Shield, Home, Store, Plug, Download, Search, FileText, Send, AtSign, type LucideIcon } from 'lucide-react';

// Product manifests refer to icons by name so the shell stays data-driven.
const MAP: Record<string, LucideIcon> = {
  bell: Bell, overview: LayoutDashboard, servers: Server, customers: Users, payments: CreditCard,
  subscriptions: HeartPulse, reminders: Mail, health: Activity, audit: ScrollText, settings: Settings,
  admins: Shield, home: Home, store: Store, plug: Plug, download: Download, search: Search, template: FileText, outbox: Send, contact: AtSign,
};
export function Icon({ name, className }: { name: string; className?: string }) {
  const C = MAP[name] ?? Box;
  return <C className={className ?? 'h-4 w-4'} aria-hidden />;
}

/** A product's own logo when it has one, otherwise its manifest icon. */
export function ProductMark({ logo, icon, size = 36, className }: { logo?: string; icon: string; size?: number; className?: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- small static logo served from /public
    return <img src={logo} alt="" width={size} height={size} className={className ?? 'shrink-0 rounded-lg'} style={{ width: size, height: size }} aria-hidden />;
  }
  return <Icon name={icon} className={className} />;
}
