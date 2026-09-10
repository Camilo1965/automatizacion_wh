import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acknowledgeInventoryClosure,
  getInventoryClosures,
} from '../api/operations-api';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function InventoryClosuresPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['inventory-closures'],
    queryFn: getInventoryClosures,
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeInventoryClosure,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['inventory-closures'] }),
  });
  if (query.isPending) return <LoadingState label="Cargando cierres…" />;
  if (query.isError)
    return <ErrorMessage message="No se pudieron cargar los cierres" />;
  return (
    <section>
      <PageHeader
        title="Cierres diarios de Treinta"
        description="Descarga el ajuste y reconócelo después de aplicarlo manualmente en Treinta."
      />
      {query.data.items.length === 0 ? (
        <EmptyState
          title="Todavía no hay cierres"
          description="El sistema generará el cierre después de las 19:00, hora de Colombia."
        />
      ) : (
        <div className="stack">
          {query.data.items.map((closure) => (
            <article className="card" key={closure.id}>
              <div className="section-header">
                <h3>
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(`${closure.businessDate}T12:00:00Z`))}
                </h3>
                <StatusBadge
                  tone={
                    closure.status === 'acknowledged' ? 'success' : 'warning'
                  }
                >
                  {closure.status === 'acknowledged' ? 'Aplicado' : 'Pendiente'}
                </StatusBadge>
              </div>
              <p>
                {closure.movementCount} movimientos · {closure.totalUnits}{' '}
                unidades · versión {closure.version}
              </p>
              <div className="action-row">
                <a
                  className="button-secondary"
                  href={`/api/admin/inventory/closures/${closure.id}/download`}
                >
                  Descargar CSV
                </a>
                {closure.status === 'generated' ? (
                  <button
                    type="button"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(closure.id)}
                  >
                    Marcar como aplicado en Treinta
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
