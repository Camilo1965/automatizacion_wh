import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listOrders } from '../api/orders-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';

export function OrdersListPage() {
  const query = useQuery({ queryKey: ['orders'], queryFn: listOrders });
  return (
    <section aria-labelledby="orders-title">
      <div className="section-header">
        <h2 id="orders-title">Pedidos</h2>
        <Link className="button-primary" to="/orders/new">
          Nuevo pedido
        </Link>
      </div>
      {query.isLoading ? <LoadingState label="Cargando pedidos…" /> : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudieron cargar los pedidos',
          )}
        />
      ) : null}
      {query.data?.length === 0 ? <p>No hay pedidos todavía.</p> : null}
      {query.data?.map((order) => (
        <article className="card" key={order.id}>
          <h3>
            <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link> ·{' '}
            {order.status}
          </h3>
          <p>
            {order.reference.code} · talla {order.size} · {order.quantity}{' '}
            par(es)
          </p>
          <p>{order.customer.name ?? 'Cliente pendiente'}</p>
        </article>
      ))}
    </section>
  );
}
