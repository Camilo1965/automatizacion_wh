import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { getCustomer } from '../api/customers-api';
import { getErrorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { operationalLabel } from '../lib/operational-label';
import { segmentLabel } from './customer-labels';

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const [searchParams] = useSearchParams();
  const fromConversation = searchParams.get('conversation');
  const query = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId!),
    enabled: customerId !== undefined,
  });
  const customer = query.data;

  return (
    <section className="space-y-6" aria-label="Ficha de cliente">
      <PageHeader
        eyebrow="Clientes"
        title={
          customer === undefined
            ? 'Ficha de cliente'
            : (customer.displayName ??
              customer.normalizedPhone ??
              'Teléfono no disponible')
        }
        description="Historial de este contacto comercial."
        actions={
          <Link
            className="text-sm underline underline-offset-2"
            to={
              fromConversation
                ? `/conversations?conversation=${fromConversation}`
                : '/customers'
            }
          >
            {fromConversation ? 'Volver a conversación' : 'Volver a clientes'}
          </Link>
        }
      />
      {query.isLoading ? (
        <LoadingState label="Cargando ficha de cliente…" />
      ) : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(query.error, 'No se pudo cargar la ficha')}
        />
      ) : null}
      {customer ? (
        <>
          <section
            className="rounded-3xl border border-border bg-card p-5"
            aria-label="Resumen del contacto"
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd className="break-all text-foreground">
                  {customer.normalizedPhone ?? 'Teléfono no disponible'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado de compra</dt>
                <dd className="text-foreground">
                  {segmentLabel(customer.segment)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identificador interno</dt>
                <dd className="break-all font-mono text-xs text-foreground">
                  {customer.id}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última actividad</dt>
                <dd className="text-foreground">
                  {new Date(customer.lastActivityAt).toLocaleString('es-CO')}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Consentimiento de marketing:{' '}
              {customer.marketingConsent === 'unknown'
                ? 'desconocido'
                : customer.marketingConsent === 'granted'
                  ? 'registrado'
                  : customer.marketingConsent === 'revoked'
                    ? 'revocado'
                    : 'denegado'}
            </p>
            {customer.segment === 'needs_review' ? (
              <p className="mt-2 text-sm text-amber-700">
                La identidad de este contacto requiere revisión.
              </p>
            ) : null}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Pedidos del cliente" className="space-y-3">
              <h3 className="text-lg font-semibold">Pedidos</h3>
              {customer.orders.length === 0 ? (
                <EmptyState
                  title="Sin pedidos vinculados"
                  description="Este contacto no tiene pedidos asociados."
                />
              ) : (
                customer.orders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-3xl border border-border bg-card p-4"
                  >
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {operationalLabel(order.status)}
                    </p>
                  </article>
                ))
              )}
            </section>
            <section
              aria-label="Conversaciones del cliente"
              className="space-y-3"
            >
              <h3 className="text-lg font-semibold">Conversaciones</h3>
              {customer.conversations.length === 0 ? (
                <EmptyState
                  title="Sin conversaciones vinculadas"
                  description="Este contacto no tiene conversaciones asociadas."
                />
              ) : (
                customer.conversations.map((conversation) => (
                  <article
                    key={conversation.id}
                    className="rounded-3xl border border-border bg-card p-4"
                  >
                    <p className="break-all text-sm text-foreground">
                      {customer.normalizedPhone === null
                        ? 'Teléfono no disponible'
                        : conversation.customerPhone}
                    </p>
                    <Link
                      to={`/conversations?conversation=${conversation.id}`}
                      className="text-sm underline underline-offset-2"
                    >
                      Abrir conversación
                    </Link>
                  </article>
                ))
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
