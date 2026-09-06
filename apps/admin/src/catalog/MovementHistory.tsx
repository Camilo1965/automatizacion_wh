import { useQuery } from '@tanstack/react-query';

import { listMovements } from '../api/catalog-api';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { getErrorMessage } from '../api/client';

type MovementHistoryProps = {
  referenceId: string;
  refreshKey: number;
};

export function MovementHistory({
  referenceId,
  refreshKey,
}: MovementHistoryProps) {
  const query = useQuery({
    queryKey: ['movements', referenceId, refreshKey],
    queryFn: () => listMovements(referenceId),
  });

  if (query.isLoading) {
    return <LoadingState label="Cargando movimientos…" />;
  }

  if (query.isError) {
    return (
      <ErrorMessage
        message={getErrorMessage(
          query.error,
          'No se pudieron cargar movimientos',
        )}
      />
    );
  }

  const items = query.data?.items ?? [];

  return (
    <section className="panel-block" aria-labelledby="movements-title">
      <h3 id="movements-title">Historial de movimientos</h3>
      {items.length === 0 ? (
        <p className="muted" role="status">
          Sin movimientos registrados
        </p>
      ) : (
        <ul className="movement-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                Talla {item.size}: {item.previousQuantity}→{item.newQuantity}
              </strong>
              {item.note !== null && item.note !== '' ? (
                <span className="muted"> — {item.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
