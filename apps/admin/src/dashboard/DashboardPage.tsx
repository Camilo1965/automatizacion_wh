import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { lazy, Suspense, useMemo, useState } from 'react';

import { getDashboardSummary } from '../api/dashboard-api';
import { getErrorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

const toneRowClass = {
  danger: 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10',
  warning: 'border-border bg-secondary hover:bg-muted',
  success: 'border-border bg-card hover:bg-muted',
  neutral: 'border-border bg-card hover:bg-muted',
} as const;

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
    <section aria-label="Panel operativo" className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Operación
          </p>
          <p className="text-base font-medium capitalize text-foreground">
            {colombiaDate}
          </p>
          <p className="text-sm text-muted-foreground" role="status">
            {query.data ? statusLine : 'Cargando…'}
          </p>
        </div>
        <UiButton
          asChild
          className="control-target rounded-[1.125rem]"
        >
          <Link to="/orders/new">Nuevo pedido</Link>
        </UiButton>
      </header>

      <PageHeader
        eyebrow="Centro de atención"
        title="Inicio"
        titleId="home-title"
        description="Atiende primero lo que tiene número. Las métricas quedan debajo."
      />

      <div
        className="flex flex-wrap gap-2"
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
            className={cn(
              'control-target rounded-[1.125rem] border px-3 py-1.5 text-sm font-medium transition-colors',
              range === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
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
          <section aria-label="Cola de trabajo" className="space-y-4">
            <div>
              <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Prioridad
              </p>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                Cola de trabajo
              </h3>
            </div>
            {openQueue.length === 0 ? (
              <EmptyState
                title="Todo al día"
                description="No hay tareas operativas pendientes en este momento."
              />
            ) : (
              <ul className="space-y-2">
                {openQueue.map((item) => (
                  <li key={item.label}>
                    <Link
                      className={cn(
                        'flex items-center gap-4 rounded-3xl border px-4 py-3 shadow-[var(--shadow-card)] transition-colors',
                        toneRowClass[item.tone],
                      )}
                      to={item.to}
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-[1.125rem] bg-foreground text-lg font-semibold text-background">
                        {item.count}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm font-semibold text-foreground">
                          {item.label}
                        </strong>
                        <small className="text-xs text-muted-foreground">
                          {item.detail}
                        </small>
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="today-title"
            className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  Rendimiento
                </p>
                <h3
                  id="today-title"
                  className="text-lg font-semibold tracking-tight text-foreground"
                >
                  Resumen de{' '}
                  {range === 'today'
                    ? 'hoy'
                    : range === '7d'
                      ? 'los últimos 7 días'
                      : 'los últimos 30 días'}
                </h3>
              </div>
              <small className="text-xs text-muted-foreground">
                Actualizado{' '}
                {new Date(query.data.generatedAt).toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </small>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ['Confirmados', query.data.today.confirmedOrders],
                  ['Contraentrega', money.format(query.data.today.codValueCop)],
                  ['Guías creadas', query.data.today.guidesCreated],
                  ['Reservado', query.data.today.reservedUnits],
                  ['Conversaciones', query.data.today.newConversations],
                  ['Despachados', query.data.today.dispatchedOrders],
                ] as const
              ).map(([label, value]) => (
                <article
                  key={label}
                  className="rounded-[1.125rem] border border-border bg-muted/60 px-3 py-3"
                >
                  <span className="block text-xs text-muted-foreground">
                    {label}
                  </span>
                  <strong className="mt-1 block text-lg font-semibold tracking-tight text-foreground">
                    {value}
                  </strong>
                </article>
              ))}
            </div>
            <Suspense
              fallback={
                <Skeleton lines={3} label="Cargando gráfica operativa" />
              }
            >
              <OperationalChart values={query.data.today} />
            </Suspense>
          </section>
        </>
      ) : null}
    </section>
  );
}
