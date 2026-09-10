import { Link } from 'react-router-dom';

const priorities = [
  {
    label: 'Guías con incidencia',
    detail: 'Revisa las guías que requieren una decisión.',
    to: '/orders?view=incidents',
  },
  {
    label: 'Atención humana',
    detail: 'Clientes que esperan una respuesta personal.',
    to: '/conversations?view=attention',
  },
  {
    label: 'Listos para despachar',
    detail: 'Pedidos con guía y pendientes de entrega.',
    to: '/orders?view=dispatch',
  },
  {
    label: 'Inventario',
    detail: 'Carga, revisa y actualiza tu catálogo.',
    to: '/catalog',
  },
];

export function DashboardPage() {
  return (
    <section aria-labelledby="dashboard-title" className="dashboard-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Operación de hoy</p>
          <h2 id="dashboard-title">Inicio</h2>
          <p className="muted">
            Empieza por las tareas que requieren tu atención.
          </p>
        </div>
        <Link className="button-primary" to="/orders/new">
          Nuevo pedido
        </Link>
      </div>

      <section aria-label="Prioridades" className="priority-grid">
        {priorities.map((priority) => (
          <Link className="priority-card" key={priority.label} to={priority.to}>
            <span className="priority-card-arrow" aria-hidden="true">
              →
            </span>
            <h3>{priority.label}</h3>
            <p>{priority.detail}</p>
          </Link>
        ))}
      </section>

      <section
        aria-label="Estado del sistema"
        className="dashboard-status card"
      >
        <div>
          <p className="eyebrow">Estado del sistema</p>
          <h3>Panel listo para operar</h3>
          <p className="muted">
            El catálogo, los pedidos y las conversaciones están disponibles
            desde este panel.
          </p>
        </div>
        <Link className="button-secondary" to="/settings/shipping">
          Abrir preferencias
        </Link>
      </section>
    </section>
  );
}
