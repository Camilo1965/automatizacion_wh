import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataEnvelopeSchema, OwnerAlertSchema } from '@camila/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, getErrorMessage } from '../api/client';
import { getAlerts } from '../api/operations-api';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

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
    <section>
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
      <div className="view-chips" role="group" aria-label="Filtros de alertas">
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
            className={
              statusFilter === value
                ? 'view-chip view-chip--active'
                : 'view-chip'
            }
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="view-chips" role="group" aria-label="Prioridad">
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
            className={
              severityFilter === value
                ? 'view-chip view-chip--active'
                : 'view-chip'
            }
            aria-pressed={severityFilter === value}
            onClick={() => setSeverityFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="filter-summary" role="status">
        {visibleAlerts.length} de {query.data.items.length} alerta(s) visibles.
      </p>
      {visibleAlerts.length === 0 ? (
        <EmptyState
          title="No hay alertas para estos filtros"
          description="Ajusta estado o prioridad para revisar el historial."
        />
      ) : (
        <div className="stack alert-center">
          {visibleAlerts.map((alert) => (
            <article
              className={`card alert-card alert-card--${alert.severity}`}
              key={alert.id}
            >
              <div className="section-header">
                <h3>{alert.title}</h3>
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
              </div>
              <p>{alert.detail}</p>
              <Link to={alert.entityUrl}>Abrir caso</Link>
              <p className="muted">
                {alert.notificationStatus
                  ? {
                      processing: 'Notificación de WhatsApp en proceso',
                      sent: 'Notificación enviada a la propietaria',
                      uncertain:
                        'Envío no confirmado: revisar antes de reenviar',
                    }[alert.notificationStatus]
                  : 'Disponible en el panel'}
              </p>
              <div className="button-row">
                {alert.status === 'open' && (
                  <button
                    type="button"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ id: alert.id, operation: 'read' })
                    }
                  >
                    Marcar leída
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button
                    type="button"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ id: alert.id, operation: 'resolve' })
                    }
                  >
                    Resolver alerta
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
