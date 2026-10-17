import { Bell, LayoutDashboard, Server, Users, CreditCard, HeartPulse, Mail, Activity, ScrollText, Settings, Box, Shield, Home, type LucideIcon } from 'lucide-react';

// Product manifests refer to icons by name so the shell stays data-driven.
const MAP: Record<string, LucideIcon> = {
  bell: Bell, overview: LayoutDashboard, servers: Server, customers: Users, payments: CreditCard,
  subscriptions: HeartPulse, reminders: Mail, health: Activity, audit: ScrollText, settings: Settings,
  admins: Shield, home: Home,
};
export function Icon({ name, className }: { name: string; className?: string }) {
  const C = MAP[name] ?? Box;
  return <C className={className ?? 'h-4 w-4'} aria-hidden />;
}
