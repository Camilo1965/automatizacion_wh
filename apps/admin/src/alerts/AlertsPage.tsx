import { useQuery } from '@tanstack/react-query';
import { getAlerts } from '../api/operations-api';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function AlertsPage() {
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
                  {alert.severity}
                </StatusBadge>
              </div>
              <p>{alert.detail}</p>
              <a href={alert.entityUrl}>Abrir caso</a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
