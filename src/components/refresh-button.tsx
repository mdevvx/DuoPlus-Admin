'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { useToast } from './toast';

/** Re-fetches the current page's server data. Shows a spinner while it runs and a toast when it is done. */
export function RefreshButton({ className, label = 'Refresh' }: { className: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const was = useRef(false);

  useEffect(() => {
    if (was.current && !pending) toast(true, 'Data refreshed');
    was.current = pending;
  }, [pending, toast]);

  return (
    <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={() => start(() => router.refresh())}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
      {pending ? 'Refreshing…' : label}
    </button>
  );
}
