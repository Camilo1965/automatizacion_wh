import { Bell, LogOut, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { GlobalSearch } from './GlobalSearch';

export function GlobalHeader({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return (
    <>
      <header className="global-header">
        <div className="mobile-header-brand">
          <img src="/brand/kairo-logo.png" alt="" className="header-logo" />
          <div>
            <h1>KAIRO</h1>
            <p className="environment-badge">Entorno local</p>
          </div>
        </div>
        <div className="global-header-actions">
          <button
            className="global-search-trigger"
            type="button"
            aria-label="Abrir búsqueda global"
            onClick={() => setSearchOpen(true)}
          >
            <Search aria-hidden="true" />
            <span>Buscar</span>
            <kbd>Ctrl K</kbd>
          </button>
          <Link
            to="/settings/whatsapp"
            className="connection-link"
            aria-label="Abrir configuración de integraciones"
          >
            <StatusBadge tone="warning">WhatsApp por validar</StatusBadge>
          </Link>
          <Link className="icon-link" to="/alerts" aria-label="Ver alertas">
            <Bell aria-hidden="true" />
          </Link>
          <span className="session-user">{username}</span>
          <Button variant="ghost" aria-label="Cerrar sesión" onClick={onLogout}>
            <LogOut aria-hidden="true" />{' '}
            <span className="desktop-only">Salir</span>
          </Button>
        </div>
      </header>
      {searchOpen ? (
        <GlobalSearch onClose={() => setSearchOpen(false)} />
      ) : null}
    </>
  );
}
