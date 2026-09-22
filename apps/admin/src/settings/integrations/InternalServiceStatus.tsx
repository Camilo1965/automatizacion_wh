import type { IntegrationHealth } from '@camila/contracts';
import { Link } from 'react-router-dom';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import {
  INTEGRATION_LABELS,
  internalServiceDiagnostic,
  type InternalServiceKey,
} from './integration-diagnostics';

const actionHrefs: Record<InternalServiceKey, string> = {
  database: '/alerts',
  mediaStorage: '/catalog',
  scheduler: '/alerts',
};

export function InternalServiceStatus({
  serviceKey,
  check,
}: {
  serviceKey: InternalServiceKey;
  check: IntegrationHealth[InternalServiceKey];
}) {
  const diagnostic = internalServiceDiagnostic(serviceKey, check);
  const tone =
    check.status === 'up'
      ? 'success'
      : check.status === 'down'
        ? 'danger'
        : 'warning';

  return (
    <Card
      className="rounded-3xl border-border shadow-[var(--shadow-card)]"
      data-service={serviceKey}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <h3 className="font-heading text-base leading-snug font-medium text-foreground">
          {INTEGRATION_LABELS[serviceKey]}
        </h3>
        <StatusBadge tone={tone}>
          {check.status === 'up'
            ? 'Activo'
            : check.status === 'down'
              ? 'Incidencia'
              : 'Degradado'}
        </StatusBadge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {check.status === 'up'
            ? `Último éxito: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
            : check.status === 'down'
              ? `Último fallo: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
              : `Última revisión: ${new Date(check.checkedAt).toLocaleString('es-CO')}`}
        </p>
        {check.detail ? (
          <p className="text-sm text-muted-foreground">{check.detail}</p>
        ) : null}
        <OperationalOutcome
          outcome={diagnostic.outcome}
          nextStep={diagnostic.nextStep}
          tone={
            check.status === 'up'
              ? 'success'
              : check.status === 'down'
                ? 'danger'
                : 'warning'
          }
        />
        <Link
          to={actionHrefs[serviceKey]}
          className="control-target inline-flex items-center justify-center rounded-[1.125rem] border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground"
        >
          {diagnostic.actionLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
