import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';

export function Skeleton({
  lines = 3,
  label = 'Cargando',
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div className="space-y-2" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <UiSkeleton
          key={index}
          className="h-3 w-full rounded-full"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}
