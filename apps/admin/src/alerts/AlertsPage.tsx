import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataEnvelopeSchema, OwnerAlertSchema } from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { getAlerts } from '../api/operations-api';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function AlertsPage() {
  const client = useQueryClient();
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
      {query.data.items.length === 0 ? (
        <EmptyState
          title="No hay alertas pendientes"
          description="Las fallas de mensajes, guías e inventario aparecerán aquí."
        />
      ) : (
        <div className="stack alert-center">
          {query.data.items.map((alert) => (
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
              <a href={alert.entityUrl}>Abrir caso</a>
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
