import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

type AppShellProps = {
  children: ReactNode;
  username?: string;
  onLogout?: () => void;
};

export function AppShell({ children, username, onLogout }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand" to="/">
          Camila <span>Operaciones</span>
        </Link>
        {username !== undefined ? (
          <nav aria-label="Principal" className="desktop-nav">
            <NavLink end to="/">
              Inicio
            </NavLink>
            <NavLink to="/orders">Pedidos</NavLink>
            <NavLink to="/conversations">Conversaciones</NavLink>
            <NavLink to="/catalog">Catálogo</NavLink>
            <p className="nav-label">Inventario</p>
            <NavLink to="/catalog-import">Importar catálogo</NavLink>
            <p className="nav-label">Configuración</p>
            <NavLink to="/settings/shipping">Preferencias</NavLink>
          </nav>
        ) : null}
      </aside>
      <div className="app-content">
        <header className="app-header">
          <div className="app-header-top">
            <p className="environment-badge">Entorno local</p>
            {username !== undefined && onLogout !== undefined ? (
              <div className="session-controls">
                <span className="session-user">{username}</span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={onLogout}
                >
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
          <h1 className="mobile-brand">Camila Operaciones</h1>
        </header>
        <main>{children}</main>
        {username !== undefined ? (
          <nav aria-label="Accesos móviles" className="mobile-nav">
            <NavLink end to="/">
              Inicio
            </NavLink>
            <NavLink to="/orders">Pedidos</NavLink>
            <NavLink to="/conversations">Chats</NavLink>
            <NavLink to="/catalog">Catálogo</NavLink>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
