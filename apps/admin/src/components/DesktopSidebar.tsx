import { Link, NavLink } from 'react-router-dom';

const primaryItems = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/conversations', label: 'Conversaciones' },
  { to: '/orders', label: 'Pedidos' },
  { to: '/catalog', label: 'Catálogo' },
] as const;

export function DesktopSidebar() {
  return (
    <aside className="app-sidebar">
      <Link className="brand" to="/" aria-label="Camila Operaciones, inicio">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <span className="brand-copy">
          <strong>Camila</strong>
          <small>Operaciones</small>
        </span>
      </Link>
      <nav aria-label="Principal" className="desktop-nav">
        <p className="nav-label">Operación</p>
        {primaryItems.map((item) => (
          <NavLink key={item.to} end={'end' in item && item.end} to={item.to}>
            {item.label}
          </NavLink>
        ))}
        <p className="nav-label">Inventario</p>
        <NavLink to="/catalog-import">Importar catálogo</NavLink>
        <p className="nav-label">Configuración</p>
        <NavLink to="/settings/shipping">Preferencias</NavLink>
      </nav>
    </aside>
  );
}
