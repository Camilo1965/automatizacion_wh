import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleId,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  titleId?: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId}>{title}</h2>
        {description ? (
          <p className="muted page-description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
