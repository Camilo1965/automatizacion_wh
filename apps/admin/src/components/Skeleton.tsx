export function Skeleton({
  lines = 3,
  label = 'Cargando',
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
