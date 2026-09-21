import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataEnvelopeSchema, OwnerAlertSchema } from '@camila/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, getErrorMessage } from '../api/client';
import { getAlerts } from '../api/operations-api';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function AlertsPage() {
  const client = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<
    'actionable' | 'open' | 'read' | 'resolved' | 'all'
  >('actionable');
  const [severityFilter, setSeverityFilter] = useState<
    'all' | 'critical' | 'warning' | 'info'
  >('all');
  const action = useMutation({
    mutationFn: ({
      id,
      operation,
    }: {
      id: string;
      operation: 'read' | 'resolve';
    }) =>
      apiRequest(`/alerts/${id}/${operation}`, {
        method: 'POST',
        schema: dataEnvelopeSchema(OwnerAlertSchema),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
  const query = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
    refetchInterval: 15_000,
  });
  if (query.isPending) return <LoadingState label="Cargando alertas…" />;
  if (query.isError)
    return <ErrorMessage message="No se pudieron cargar las alertas" />;
  const visibleAlerts = query.data.items.filter((alert) => {
    const statusMatches =
      statusFilter === 'all' ||
      (statusFilter === 'actionable'
        ? alert.status !== 'resolved'
        : alert.status === statusFilter);
    const severityMatches =
      severityFilter === 'all' || alert.severity === severityFilter;
    return statusMatches && severityMatches;
  });
  return (
    <section className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Incidencias que requieren una decisión de la propietaria."
      />
      {action.isError && (
        <ErrorMessage
          message={getErrorMessage(
            action.error,
            'No se pudo actualizar la alerta.',
          )}
        />
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros de alertas">
        {(
          [
            ['actionable', 'Pendientes'],
            ['open', 'Abiertas'],
            ['read', 'Leídas'],
            ['resolved', 'Resueltas'],
            ['all', 'Todas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              'control-target rounded-[1.125rem] border px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Prioridad">
        {(
          [
            ['all', 'Toda prioridad'],
            ['critical', 'Urgentes'],
            ['warning', 'Revisar'],
            ['info', 'Info'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              'control-target rounded-[1.125rem] border px-3 py-1.5 text-sm font-medium transition-colors',
              severityFilter === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-pressed={severityFilter === value}
            onClick={() => setSeverityFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {visibleAlerts.length} de {query.data.items.length} alerta(s) visibles.
      </p>
      {visibleAlerts.length === 0 ? (
        <EmptyState
          title="No hay alertas para estos filtros"
          description="Ajusta estado o prioridad para revisar el historial."
        />
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => (
            <Card
              className={cn(
                'rounded-3xl border-border shadow-[var(--shadow-card)]',
                alert.severity === 'critical' && 'border-destructive/40',
              )}
              key={alert.id}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-base font-semibold">
                  {alert.title}
                </CardTitle>
                <StatusBadge
                  tone={alert.severity === 'critical' ? 'danger' : 'warning'}
                >
                  {
                    {
                      info: 'Información',
                      warning: 'Revisar',
                      critical: 'Urgente',
                    }[alert.severity]
                  }
                </StatusBadge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">{alert.detail}</p>
                <Link
                  className="text-sm font-medium underline underline-offset-2"
                  to={alert.entityUrl}
                >
                  Abrir caso
                </Link>
                <p className="text-sm text-muted-foreground">
                  {alert.notificationStatus
                    ? {
                        processing: 'Notificación de WhatsApp en proceso',
                        sent: 'Notificación enviada a la propietaria',
                        uncertain:
                          'Envío no confirmado: revisar antes de reenviar',
                      }[alert.notificationStatus]
                    : 'Disponible en el panel'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {alert.status === 'open' && (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={action.isPending}
                      onClick={() =>
                        action.mutate({ id: alert.id, operation: 'read' })
                      }
                    >
                      Marcar leída
                    </Button>
                  )}
                  {alert.status !== 'resolved' && (
                    <Button
                      type="button"
                      loading={action.isPending}
                      onClick={() =>
                        action.mutate({ id: alert.id, operation: 'resolve' })
                      }
                    >
                      Resolver alerta
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
