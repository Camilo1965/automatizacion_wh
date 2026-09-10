import { Link } from 'react-router-dom';

import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

export function GlobalHeader({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  return (
    <header className="global-header">
      <div className="mobile-header-brand">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <div>
          <h1>Camila Operaciones</h1>
          <p className="environment-badge">Entorno local</p>
        </div>
      </div>
      <div className="global-header-actions">
        <Link
          to="/settings/whatsapp"
          className="connection-link"
          aria-label="Abrir configuración de integraciones"
        >
          <StatusBadge tone="warning">WhatsApp por validar</StatusBadge>
        </Link>
        <span className="session-user">{username}</span>
        <Button variant="ghost" aria-label="Cerrar sesión" onClick={onLogout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
