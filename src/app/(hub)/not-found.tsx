import Link from 'next/link';
import { SearchX } from 'lucide-react';

/** Themed 404 for anything inside the panel (a customer or server that has no data, a removed page). */
export default function HubNotFound() {
  return (
    <div className="card mx-auto mt-16 flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded bg-subtle text-muted"><SearchX className="h-5 w-5" aria-hidden /></span>
      <div className="font-semibold">Nothing to show here</div>
      <p className="text-muted">This record does not exist or has no data. It may have been removed, or the link is out of date.</p>
      <Link className="btn btn-primary" href="/">Back to home</Link>
    </div>
  );
}
