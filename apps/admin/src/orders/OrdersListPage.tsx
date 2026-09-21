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
    <section aria-labelledby="orders-title" className="orders-page">
      <PageHeader
        eyebrow="Venta"
        title="Pedidos"
        titleId="orders-title"
        description="Filtra por etapa y abre el pedido que toca atender."
        actions={
          <Link
            className="ui-button ui-button--primary control-target"
            to="/orders/new"
          >
            Nuevo pedido
          </Link>
        }
      />
      <div className="view-chips" role="tablist" aria-label="Vistas de pedidos">
        {views.map((item) => {
          const active = (item.id === null && !view) || view === item.id;
          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'view-chip view-chip--active' : 'view-chip'}
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
        <p className="filter-summary" role="status">
          Vista: {operationalLabel(view)} · <Link to="/orders">Ver todos</Link>
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
      <div className="order-list">
        {orders.map((order) => (
          <article className="order-row" key={order.id}>
            <div className="order-row-main">
              <Link to={`/orders/${order.id}`} className="order-row-title">
                {order.orderNumber}
              </Link>
              <StatusBadge tone={statusTone(order.status)}>
                {operationalLabel(order.status)}
              </StatusBadge>
            </div>
            <p className="order-row-meta">
              {order.reference.code} · talla {order.size} · {order.quantity}{' '}
              par(es)
            </p>
            <p className="order-row-customer">
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
