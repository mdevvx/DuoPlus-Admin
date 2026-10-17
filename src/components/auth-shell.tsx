import { ShieldCheck, Activity, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './shell';

const POINTS = [
  { Icon: Activity, title: 'Everything at a glance', text: 'Servers, subscriptions, revenue and bot health in one place.' },
  { Icon: ShieldCheck, title: 'Locked down by default', text: 'Admin-only access with a second factor on every session.' },
  { Icon: ScrollText, title: 'Every change on record', text: 'Each action is written to an append-only audit log.' },
];

/** Split layout used by the sign-in and two-factor screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-[1.05fr_1fr]">
      <section className="hero relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="text-lg font-bold tracking-tight">DuoPlus Admin</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-[32px] font-semibold leading-10 tracking-tight">One place to run every DuoPlus product.</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-side-accent"><Icon className="h-5 w-5" aria-hidden /></span>
                <div><div className="font-semibold">{t}</div><div className="text-side-muted">{text}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-side-muted">Internal tool. Authorised admins only.</p>
      </section>
      <section className="flex items-center justify-center p-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><Logo /><span className="text-[15px] font-semibold">DuoPlus Admin</span></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-7 mt-1.5 text-muted">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
