import { Card, Skeleton, TableSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-7 h-4 w-80" />
      <div className="mb-6 grid grid-cols-4 gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}><Skeleton className="mb-3 h-3 w-24" /><Skeleton className="mb-2 h-8 w-28" /><Skeleton className="h-3 w-36" /></Card>
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}
