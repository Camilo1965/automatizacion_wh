import { useQuery } from '@tanstack/react-query';
import { getIntegrationHealth } from '../api/operations-api';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

const labels = {
  database: 'Base de datos',
  mediaStorage: 'Archivos y fotografías',
  whatsapp: 'WhatsApp',
  shipping: '99envíos',
  scheduler: 'Scheduler',
} as const;

export function IntegrationsPage() {
  const query = useQuery({
    queryKey: ['integration-health'],
    queryFn: getIntegrationHealth,
    refetchInterval: 60_000,
  });
  if (query.isPending)
    return <LoadingState label="Comprobando integraciones…" />;
  if (query.isError)
    return (
      <ErrorMessage message="No se pudo comprobar el estado de las integraciones" />
    );
  return (
    <section>
      <PageHeader
        title="Integraciones"
        description="Comprobaciones seguras que no envían mensajes ni crean guías."
      />
      <div className="metric-grid">
        {Object.entries(query.data).map(([key, check]) => (
          <article className="card" key={key}>
            <div className="section-header">
              <h3>{labels[key as keyof typeof labels]}</h3>
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
                  ? 'Disponible'
                  : check.status === 'down'
                    ? 'Caído'
                    : 'Pendiente'}
              </StatusBadge>
            </div>
            <p className="muted">
              {check.detail ??
                `Última revisión: ${new Date(check.checkedAt).toLocaleString('es-CO')}`}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
