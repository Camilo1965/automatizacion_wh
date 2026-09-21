import { useInfiniteQuery } from '@tanstack/react-query';

import {
  listMovements,
  type InventoryMovementPublic,
} from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageSection } from '../components/PageHeader';

type MovementHistoryProps = {
  referenceId: string;
  refreshKey: number;
};

function formatSignedDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }
  return String(delta);
}

function flattenUnique(
  pages: Array<{ items: InventoryMovementPublic[] }>,
): InventoryMovementPublic[] {
  const seen = new Set<string>();
  const items: InventoryMovementPublic[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

export function MovementHistory({
  referenceId,
  refreshKey,
}: MovementHistoryProps) {
  const query = useInfiniteQuery({
    queryKey: ['movements', referenceId, refreshKey],
    queryFn: ({ pageParam }) =>
      listMovements(
        referenceId,
        pageParam === undefined ? {} : { cursor: pageParam },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (query.isLoading) {
    return <LoadingState label="Cargando movimientos…" />;
  }

  if (query.isError && query.data === undefined) {
    return (
      <ErrorMessage
        message={getErrorMessage(
          query.error,
          'No se pudieron cargar movimientos',
        )}
      />
    );
  }

  const items = flattenUnique(query.data?.pages ?? []);
  const hasNextPage = query.hasNextPage === true;

  return (
    <PageSection aria-labelledby="movements-title" className="space-y-4">
      <h3
        id="movements-title"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        Historial de movimientos
      </h3>
      {items.length === 0 ? (
        <EmptyState
          title="Sin movimientos registrados"
          description="Los ajustes de stock y reservas aparecerán aquí."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[1.125rem] border border-border bg-muted px-3 py-2 text-sm"
            >
              <strong className="font-medium text-foreground">
                Talla {item.size}: {item.previousQuantity}→{item.newQuantity} (
                {formatSignedDelta(item.delta)})
              </strong>
              <span className="text-muted-foreground"> — {item.reason}</span>
              {item.note !== null && item.note !== '' ? (
                <span className="text-muted-foreground"> — {item.note}</span>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString('es-ES')}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.isFetchNextPageError ? (
        <ErrorMessage
          message={getErrorMessage(query.error, 'No se pudo cargar más')}
        />
      ) : null}
      {hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="h-11"
          onClick={() => {
            void query.fetchNextPage();
          }}
          loading={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      ) : null}
    </PageSection>
  );
}
