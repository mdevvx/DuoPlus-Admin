'use client';

import { XCircle } from 'lucide-react';

export default function HubError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-16 flex max-w-md flex-col items-center gap-3 p-8 text-center" role="alert">
      <XCircle className="h-6 w-6 text-danger" aria-hidden />
      <div className="font-semibold">This page could not be loaded</div>
      <p className="text-muted">The data source did not respond as expected. Nothing was changed.</p>
      <button className="btn btn-primary" onClick={reset}>Retry</button>
    </div>
  );
}
