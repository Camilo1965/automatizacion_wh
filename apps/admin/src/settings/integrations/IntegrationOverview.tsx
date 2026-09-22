import type { IntegrationHealth } from '@camila/contracts';

import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { InternalServiceStatus } from './InternalServiceStatus';
import { INTEGRATION_LABELS } from './integration-diagnostics';

function ProviderHealthCard({
  label,
  check,
}: {
  label: string;
  check: IntegrationHealth['whatsapp'] | IntegrationHealth['shipping'];
}) {
  return (
    <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <h3 className="font-heading text-base leading-snug font-medium text-foreground">
          {label}
        </h3>
        <StatusBadge
          tone={
            check.status === 'up'
              ? 'success'
              : check.status === 'down'
                ? 'danger'
                : 'warning'
          }
        >
          {check.status === 'up'
            ? 'Activo'
            : check.status === 'down'
              ? 'Incidencia'
              : 'Degradado'}
        </StatusBadge>
      </CardHeader>
      <CardContent className="space-y-2">
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
        <p className="text-xs text-muted-foreground">
          Canal externo: usa el ciclo credenciales → prueba → activación →
          verificación.
        </p>
      </CardContent>
    </Card>
  );
}

export function IntegrationOverview({ health }: { health: IntegrationHealth }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <InternalServiceStatus serviceKey="database" check={health.database} />
      <InternalServiceStatus
        serviceKey="mediaStorage"
        check={health.mediaStorage}
      />
      <ProviderHealthCard
        label={INTEGRATION_LABELS.whatsapp}
        check={health.whatsapp}
      />
      <ProviderHealthCard
        label={INTEGRATION_LABELS.shipping}
        check={health.shipping}
      />
      <InternalServiceStatus serviceKey="scheduler" check={health.scheduler} />
    </div>
  );
}
