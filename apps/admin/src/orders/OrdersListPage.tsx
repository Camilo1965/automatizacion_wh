import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { listOrders } from '../api/orders-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { operationalLabel } from '../lib/operational-label';
import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const views = [
  { id: null, label: 'Todos' },
  { id: 'awaiting_confirmation', label: 'Confirmación' },
  { id: 'ready_to_dispatch', label: 'Despachar' },
  { id: 'incidents', label: 'Incidencias' },
] as const;

function statusTone(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'confirmed' || status === 'dispatched') return 'success';
  if (status === 'cancelled' || status === 'returned') return 'danger';
  if (status === 'draft') return 'warning';
  return 'info';
}

export function OrdersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view');
  const query = useInfiniteQuery({
    queryKey: ['orders', view],
    queryFn: ({ pageParam }) =>
      listOrders(
        undefined,
        view as
          | 'incidents'
          | 'ready_to_dispatch'
          | 'awaiting_confirmation'
          | undefined,
        pageParam,
      ),
    initialPageParam: null as Awaited<
      ReturnType<typeof listOrders>
    >['nextCursor'],
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const orders = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="orders-title" className="space-y-6">
      <PageHeader
        eyebrow="Venta"
        title="Pedidos"
        titleId="orders-title"
        description="Filtra por etapa y abre el pedido que toca atender."
        actions={
          <UiButton asChild className="control-target rounded-[1.125rem]">
            <Link to="/orders/new">Nuevo pedido</Link>
          </UiButton>
        }
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vistas de pedidos">
        {views.map((item) => {
          const active = (item.id === null && !view) || view === item.id;
          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'control-target rounded-[1.125rem] border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => {
                if (item.id === null) setSearchParams({});
                else setSearchParams({ view: item.id });
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {view ? (
        <p className="text-sm text-muted-foreground" role="status">
          Vista: {operationalLabel(view)} ·{' '}
          <Link className="underline underline-offset-2" to="/orders">
            Ver todos
          </Link>
        </p>
      ) : null}
      {query.isLoading ? <LoadingState label="Cargando pedidos…" /> : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudieron cargar los pedidos',
          )}
        />
      ) : null}
      {!query.isLoading && orders.length === 0 ? (
        <EmptyState
          title="No hay pedidos en esta vista"
          description="Cambia el filtro o crea un pedido nuevo."
        />
      ) : null}
      <div className="space-y-2">
        {orders.map((order) => (
          <article
            className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            key={order.id}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/orders/${order.id}`}
                className="text-base font-semibold tracking-tight text-foreground underline-offset-2 hover:underline"
              >
                {order.orderNumber}
              </Link>
              <StatusBadge tone={statusTone(order.status)}>
                {operationalLabel(order.status)}
              </StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.reference.code} · talla {order.size} · {order.quantity}{' '}
              par(es)
            </p>
            <p className="text-sm text-foreground">
              {order.customer.name ?? 'Cliente pendiente'}
              {order.destination.localityName
                ? ` · ${order.destination.localityName}`
                : ''}
            </p>
          </article>
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          variant="secondary"
        >
          Cargar más pedidos
        </Button>
      ) : null}
    </section>
  );
}
