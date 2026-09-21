import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <div
        className="flex size-10 items-center justify-center rounded-[1.125rem] border border-border bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        ◇
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
