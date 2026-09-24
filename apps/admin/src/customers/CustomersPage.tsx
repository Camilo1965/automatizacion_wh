import { useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  CustomerReconciliation,
  CustomerSegment,
} from '@camila/contracts';

import { getCustomerReconciliation, listCustomers } from '../api/customers-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { cn } from '@/lib/utils';
import { segmentLabel } from './customer-labels';

const filters: readonly { label: string; value: CustomerSegment | null }[] = [
  { label: 'Todos', value: null },
  { label: 'Compradores', value: 'buyer' },
  { label: 'Sin compra acreditada', value: 'not_yet_buyer' },
  { label: 'Revisar identidad', value: 'needs_review' },
];

export function CustomersPage() {
  const [segment, setSegment] = useState<CustomerSegment | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['customers', segment, search],
    queryFn: ({ pageParam }) =>
      listCustomers({
        ...(segment === null ? {} : { segment }),
        ...(search === '' ? {} : { query: search }),
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <section className="space-y-6" aria-label="Directorio de clientes">
      <PageHeader
        eyebrow="Relación comercial"
        title="Clientes"
        description="Contactos e historial de pedidos y conversaciones. Comprador significa entrega acreditada y no devuelta."
        actions={
          <Link
            className="control-target inline-flex items-center rounded-[1.125rem] bg-secondary px-4 text-sm font-medium text-secondary-foreground"
            to="/customers/reconciliation"
          >
            Pendientes por revisar
          </Link>
        }
      />
      <form
        role="search"
        onSubmit={submitSearch}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Buscar clientes"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Nombre o teléfono"
          maxLength={120}
          className="control-target min-w-0 flex-1 rounded-[1.125rem] border border-input bg-card px-4 py-2 text-sm"
        />
        <Button type="submit">Buscar</Button>
      </form>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar clientes">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            aria-pressed={segment === filter.value}
            onClick={() => setSegment(filter.value)}
            className={cn(
              'control-target rounded-[1.125rem] border px-3 py-2 text-sm font-medium',
              segment === filter.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {query.isLoading ? <LoadingState label="Cargando clientes…" /> : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudieron cargar los clientes',
          )}
        />
      ) : null}
      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState
          title="No hay clientes en esta vista"
          description="Prueba otra búsqueda o filtro."
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <Link
              className="font-semibold text-foreground underline-offset-2 hover:underline"
              to={`/customers/${item.id}`}
            >
              {item.displayName ??
                item.normalizedPhone ??
                'Teléfono no disponible'}
            </Link>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {item.normalizedPhone ?? 'Teléfono no disponible'}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {segmentLabel(item.segment)}
            </p>
          </article>
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Cargar más clientes
        </Button>
      ) : null}
    </section>
  );
}

export function CustomerReconciliationPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['customers-reconciliation'],
    queryFn: () => getCustomerReconciliation(),
  });
  const [loaded, setLoaded] = useState<{
    base: CustomerReconciliation;
    baseUpdatedAt: number;
    value: CustomerReconciliation;
  } | null>(null);
  const current =
    loaded !== null &&
    loaded.base === query.data &&
    loaded.baseUpdatedAt === query.dataUpdatedAt
      ? loaded.value
      : query.data;
  const more = useMutation({
    mutationFn: (input: {
      kind: 'orders' | 'conversations';
      base: CustomerReconciliation;
      baseUpdatedAt: number;
      ordersCursor: string | null;
      conversationsCursor: string | null;
    }) => getCustomerReconciliation(input),
    onSuccess: (page, input) => {
      if (
        client.getQueryData<CustomerReconciliation>([
          'customers-reconciliation',
        ]) !== input.base ||
        client.getQueryState(['customers-reconciliation'])?.dataUpdatedAt !==
          input.baseUpdatedAt
      )
        return;
      setLoaded((previous) => {
        const existing =
          previous?.base === input.base &&
          previous.baseUpdatedAt === input.baseUpdatedAt
            ? previous.value
            : input.base;
        if (input.kind === 'orders') {
          const ids = new Set(existing.orders.map((item) => item.id));
          return {
            base: input.base,
            baseUpdatedAt: input.baseUpdatedAt,
            value: {
              ...existing,
              orders: [
                ...existing.orders,
                ...page.orders.filter((item) => !ids.has(item.id)),
              ],
              ordersNextCursor: page.ordersNextCursor,
            },
          };
        }
        const ids = new Set(existing.conversations.map((item) => item.id));
        return {
          base: input.base,
          baseUpdatedAt: input.baseUpdatedAt,
          value: {
            ...existing,
            conversations: [
              ...existing.conversations,
              ...page.conversations.filter((item) => !ids.has(item.id)),
            ],
            conversationsNextCursor: page.conversationsNextCursor,
          },
        };
      });
    },
  });

  function loadMore(kind: 'orders' | 'conversations') {
    if (!query.data || !current || more.isPending) return;
    more.mutate({
      kind,
      base: query.data,
      baseUpdatedAt: query.dataUpdatedAt,
      ordersCursor: current.ordersNextCursor,
      conversationsCursor: current.conversationsNextCursor,
    });
  }

  return (
    <section className="space-y-6" aria-label="Pendientes por revisar">
      <PageHeader
        eyebrow="Clientes"
        title="Pendientes por revisar"
        description="Identidad sin resolver. Estos registros históricos no se han vinculado a una ficha de cliente; abrirlos no confirma que pertenezcan a la misma persona."
        actions={
          <Link
            className="text-sm underline underline-offset-2"
            to="/customers"
          >
            Volver a clientes
          </Link>
        }
      />
      {query.isLoading ? <LoadingState label="Cargando pendientes…" /> : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudieron cargar los pendientes',
          )}
        />
      ) : null}
      {more.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            more.error,
            'No se pudieron cargar más pendientes',
          )}
        />
      ) : null}
      {current ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Pedidos pendientes" className="space-y-3">
            <h3 className="text-lg font-semibold">Pedidos pendientes</h3>
            {current.orders.length === 0 ? (
              <EmptyState
                title="Sin pedidos pendientes"
                description="No hay pedidos históricos sin identidad resuelta."
              />
            ) : null}
            {current.orders.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-border bg-card p-4"
              >
                <Link
                  className="font-semibold underline-offset-2 hover:underline"
                  to={order.href}
                >
                  {order.orderNumber}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {order.customerName ?? 'Nombre sin registrar'} ·{' '}
                  {order.customerPhone ?? 'Teléfono sin registrar'}
                </p>
              </article>
            ))}
            {current.ordersNextCursor !== null ? (
              <Button
                variant="secondary"
                loading={more.isPending}
                onClick={() => loadMore('orders')}
              >
                Cargar más pedidos pendientes
              </Button>
            ) : null}
          </section>
          <section aria-label="Conversaciones pendientes" className="space-y-3">
            <h3 className="text-lg font-semibold">Conversaciones pendientes</h3>
            {current.conversations.length === 0 ? (
              <EmptyState
                title="Sin conversaciones pendientes"
                description="No hay conversaciones históricas sin identidad resuelta."
              />
            ) : null}
            {current.conversations.map((conversation) => (
              <article
                key={conversation.id}
                className="rounded-3xl border border-border bg-card p-4"
              >
                <p className="break-all text-sm text-foreground">
                  {conversation.customerPhone}
                </p>
                <Link
                  className="text-sm underline underline-offset-2"
                  to={conversation.href}
                >
                  Abrir conversación
                </Link>
              </article>
            ))}
            {current.conversationsNextCursor !== null ? (
              <Button
                variant="secondary"
                loading={more.isPending}
                onClick={() => loadMore('conversations')}
              >
                Cargar más conversaciones pendientes
              </Button>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
