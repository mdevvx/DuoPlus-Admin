import { Skeleton, TableSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-7 h-4 w-72" />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
