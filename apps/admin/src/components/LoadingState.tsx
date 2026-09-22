import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Cargando…' }: LoadingStateProps) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <UiSkeleton className="h-4 w-40 rounded-full" />
      <UiSkeleton className="h-24 w-full rounded-3xl" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
