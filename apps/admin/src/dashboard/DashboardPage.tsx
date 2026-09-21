import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { lazy, Suspense, useMemo, useState } from 'react';

import { getDashboardSummary } from '../api/dashboard-api';
import { getErrorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';

const OperationalChart = lazy(() =>
  import('./OperationalChart').then((module) => ({
    default: module.OperationalChart,
  })),
);

const priorityDefinitions = [
  {
    label: 'Guías con incidencia',
    detail: 'Revisa las guías que requieren una decisión.',
    to: '/orders?view=incidents',
    field: 'guideIncidents',
    tone: 'danger',
  },
  {
    label: 'Conversaciones por atender',
    detail: 'Clientes que esperan una respuesta personal.',
    to: '/conversations?attention=true',
    field: 'conversations',
    tone: 'warning',
  },
  {
    label: 'Listos para despachar',
    detail: 'Pedidos con guía y pendientes de entrega.',
    to: '/orders?view=ready_to_dispatch',
    field: 'readyToDispatch',
    tone: 'success',
  },
  {
    label: 'Esperando confirmación',
    detail: 'Pedidos que todavía esperan al cliente.',
    to: '/orders?view=awaiting_confirmation',
    field: 'awaitingConfirmation',
    tone: 'neutral',
  },
  {
    label: 'Cierre pendiente',
    detail: 'Reconoce o revisa el cierre generado para Treinta.',
    to: '/inventory/closures',
    field: 'closurePending',
    tone: 'warning',
  },
  {
    label: 'Integraciones',
    detail: 'Servicios configurados con fallas o sin verificación.',
    to: '/settings/integrations',
    field: 'integrationFailures',
    tone: 'danger',
  },
] as const;

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function queueCount(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

export function DashboardPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('today');
  const query = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => getDashboardSummary(range),
  });

  const openQueue = useMemo(() => {
    if (!query.data) return [];
    return priorityDefinitions
      .map((priority) => ({
        ...priority,
        count: queueCount(query.data.queues[priority.field]),
      }))
      .filter((item) => item.count > 0);
  }, [query.data]);

  const colombiaDate = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  }).format(new Date());

  const statusLine =
    openQueue.length === 0
      ? 'Todo al día'
      : openQueue.length === 1
        ? `1 tarea: ${openQueue[0]!.label.toLowerCase()}`
        : `${openQueue.reduce((sum, item) => sum + item.count, 0)} pendientes en ${openQueue.length} colas`;

  return (
    <section aria-label="Panel operativo" className="dashboard-page">
      <header className="home-status-strip">
        <div>
          <p className="eyebrow">Operación</p>
          <p className="home-status-date">{colombiaDate}</p>
          <p className="home-status-line" role="status">
            {query.data ? statusLine : 'Cargando…'}
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary control-target"
          to="/orders/new"
        >
          Nuevo pedido
        </Link>
      </header>

      <PageHeader
        eyebrow="Centro de atención"
        title="Inicio"
        titleId="home-title"
        description="Atiende primero lo que tiene número. Las métricas quedan debajo."
      />

      <div
        className="dashboard-range"
        role="group"
        aria-label="Periodo de métricas"
      >
        {(
          [
            ['today', 'Hoy'],
            ['7d', '7 días'],
            ['30d', '30 días'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={range === value ? 'active' : ''}
            onClick={() => setRange(value)}
            aria-pressed={range === value}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Skeleton lines={4} label="Cargando resumen operativo" />
      ) : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudo cargar el resumen operativo',
          )}
        />
      ) : null}

      {query.data ? (
        <>
          <section aria-label="Cola de trabajo" className="work-queue">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Prioridad</p>
                <h3>Cola de trabajo</h3>
              </div>
            </div>
            {openQueue.length === 0 ? (
              <EmptyState
                title="Todo al día"
                description="No hay tareas operativas pendientes en este momento."
              />
            ) : (
              <ul className="work-queue-list">
                {openQueue.map((item) => (
                  <li key={item.label}>
                    <Link
                      className={`work-queue-row work-queue-row--${item.tone}`}
                      to={item.to}
                    >
                      <span className="work-queue-count">{item.count}</span>
                      <span className="work-queue-copy">
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <span aria-hidden="true" className="work-queue-arrow">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="today-title" className="today-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Rendimiento</p>
                <h3 id="today-title">
                  Resumen de{' '}
                  {range === 'today'
                    ? 'hoy'
                    : range === '7d'
                      ? 'los últimos 7 días'
                      : 'los últimos 30 días'}
                </h3>
              </div>
              <small>
                Actualizado{' '}
                {new Date(query.data.generatedAt).toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </small>
            </div>
            <div className="metric-band">
              <article>
                <span>Confirmados</span>
                <strong>{query.data.today.confirmedOrders}</strong>
              </article>
              <article>
                <span>Contraentrega</span>
                <strong>{money.format(query.data.today.codValueCop)}</strong>
              </article>
              <article>
                <span>Guías creadas</span>
                <strong>{query.data.today.guidesCreated}</strong>
              </article>
              <article>
                <span>Reservado</span>
                <strong>{query.data.today.reservedUnits}</strong>
              </article>
              <article>
                <span>Conversaciones</span>
                <strong>{query.data.today.newConversations}</strong>
              </article>
              <article>
                <span>Despachados</span>
                <strong>{query.data.today.dispatchedOrders}</strong>
              </article>
            </div>
            <Suspense
              fallback={
                <Skeleton lines={3} label="Cargando gráfica operativa" />
              }
            >
              <div className="home-chart-panel">
                <OperationalChart values={query.data.today} />
              </div>
            </Suspense>
          </section>
        </>
      ) : null}
    </section>
  );
}
