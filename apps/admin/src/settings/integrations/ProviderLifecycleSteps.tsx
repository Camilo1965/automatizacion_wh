import { LIFECYCLE_STEPS } from './integration-diagnostics';

export function ProviderLifecycleSteps({
  currentStep,
}: {
  currentStep: 1 | 2 | 3 | 4;
}) {
  return (
    <ol
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Ciclo de vida"
    >
      {LIFECYCLE_STEPS.map((step, index) => {
        const stepNumber = (index + 1) as 1 | 2 | 3 | 4;
        const active = stepNumber === currentStep;
        const done = stepNumber < currentStep;
        return (
          <li
            key={step}
            className={`rounded-[1.125rem] border px-3 py-2 text-sm ${
              active
                ? 'border-foreground bg-muted font-medium text-foreground'
                : done
                  ? 'border-border bg-card text-foreground'
                  : 'border-border bg-muted/40 text-muted-foreground'
            }`}
            aria-current={active ? 'step' : undefined}
          >
            {step}
          </li>
        );
      })}
    </ol>
  );
}
