'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type FormEvent, type ReactNode } from 'react';

/** Filters stay shareable URLs, but apply through client-side navigation so the shell never reloads. */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) {
      if (typeof v === 'string' && v.trim() !== '') qs.set(k, v.trim());
    }
    const q = qs.toString();
    start(() => router.push(q ? `${action}?${q}` : action));
  }

  return (
    <form method="get" action={action} onSubmit={onSubmit} aria-busy={pending} className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-soft">
      {children}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Applying…' : 'Apply'}</button>
      <Link className="btn" href={action}>Reset</Link>
    </form>
  );
}
