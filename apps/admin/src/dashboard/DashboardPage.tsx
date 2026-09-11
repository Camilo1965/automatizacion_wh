import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';

import { getDashboardSummary } from '../api/dashboard-api';
import { getErrorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';

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
] as const;

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function DashboardPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('today');
  const query = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => getDashboardSummary(range),
  });

  return (
    <section aria-label="Panel operativo" className="dashboard-page">
      <PageHeader
        eyebrow="Operación de hoy"
        title="Inicio"
        description="Empieza por lo que requiere tu atención y revisa cómo avanza el día."
        actions={
          <Link
            className="ui-button ui-button--primary control-target"
            to="/orders/new"
          >
            Nuevo pedido
          </Link>
        }
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
          <section aria-label="Prioridades" className="priority-grid">
            {priorityDefinitions.map((priority) => (
              <Link
                className={`priority-card priority-card--${priority.tone}`}
                key={priority.label}
                to={priority.to}
              >
                <span className="priority-count">
                  {query.data.queues[priority.field]}
                </span>
                <span className="priority-card-arrow" aria-hidden="true">
                  →
                </span>
                <h3>{priority.label}</h3>
                <p>{priority.detail}</p>
              </Link>
            ))}
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
            <div className="metric-grid">
              <article className="metric-card">
                <span>Conversaciones nuevas</span>
                <strong>{query.data.today.newConversations}</strong>
              </article>
              <article className="metric-card">
                <span>Pedidos confirmados</span>
                <strong>{query.data.today.confirmedOrders}</strong>
              </article>
              <article className="metric-card">
                <span>Pedidos despachados</span>
                <strong>{query.data.today.dispatchedOrders}</strong>
              </article>
              <article className="metric-card metric-card--money">
                <span>Valor contraentrega</span>
                <strong>{money.format(query.data.today.codValueCop)}</strong>
              </article>
              <article className="metric-card">
                <span>Guías creadas</span>
                <strong>{query.data.today.guidesCreated}</strong>
              </article>
              <article className="metric-card">
                <span>Unidades reservadas</span>
                <strong>{query.data.today.reservedUnits}</strong>
              </article>
            </div>
          </section>

          {Object.values(query.data.queues).every(
            (value) => value === 0 || value === false,
          ) ? (
            <EmptyState
              title="Todo al día"
              description="No hay tareas operativas pendientes en este momento."
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
