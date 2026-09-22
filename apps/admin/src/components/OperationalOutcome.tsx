type OutcomeTone = 'success' | 'warning' | 'danger' | 'info';

export function OperationalOutcome({
  outcome,
  nextStep,
  tone = 'info',
}: {
  outcome: string;
  nextStep: string;
  tone?: OutcomeTone;
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : tone === 'warning'
        ? 'border-border bg-muted text-foreground'
        : tone === 'success'
          ? 'border-border bg-muted/40 text-foreground'
          : 'border-border bg-muted/50 text-foreground';

  return (
    <div
      className={`space-y-1 rounded-[1.125rem] border px-4 py-3 text-sm ${toneClass}`}
      role="status"
    >
      <p>{outcome}</p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Siguiente paso:</span>{' '}
        {nextStep}
      </p>
    </div>
  );
}
