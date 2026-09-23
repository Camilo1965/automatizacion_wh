import { Link } from 'react-router-dom';
import type { ShippingPolicy, ShippingRulePublic } from '@camila/contracts';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { describePolicy, policyModeLabel } from './policy-utils';

export function ShippingOperationsStatus({
  globalPolicy,
  rules,
  loadError,
  loading,
  onRetry,
}: {
  globalPolicy: ShippingPolicy;
  rules: readonly ShippingRulePublic[];
  loadError: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const activeRules = rules.filter((rule) => rule.active).length;
  return (
    <section aria-label="Incidencias y estado" className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de envío">
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Regla general
          </dt>
          <dd className="text-sm text-foreground">
            {describePolicy(globalPolicy)}
          </dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Seguro
          </dt>
          <dd className="text-sm text-foreground">
            {policyModeLabel(globalPolicy)}
          </dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Excepciones activas
          </dt>
          <dd className="text-sm text-foreground">{activeRules}</dd>
        </div>
      </dl>
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-lg">Incidencias y estado</CardTitle>
          <CardDescription>
            Supervisa novedades de entrega y el estado operativo del canal de
            envíos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadError ? (
            <div className="space-y-2">
              <OperationalOutcome
                tone="danger"
                outcome={loadError}
                nextStep="reintenta cargar preferencias antes de guardar cambios."
              />
              <Button
                type="button"
                variant="secondary"
                loading={loading}
                onClick={onRetry}
              >
                Reintentar carga
              </Button>
            </div>
          ) : (
            <OperationalOutcome
              tone={activeRules > 0 ? 'success' : 'info'}
              outcome={
                activeRules > 0
                  ? `${activeRules} excepciones municipales activas.`
                  : 'Sin excepciones municipales; aplica la preferencia general.'
              }
              nextStep="abre novedades de entrega si hay guías con incidencia."
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">Operación COD</StatusBadge>
            <Link
              to="/shipping/incidents"
              className="control-target inline-flex items-center justify-center rounded-[1.125rem] border border-border bg-secondary px-3 text-sm font-medium"
            >
              Abrir novedades de entrega
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
