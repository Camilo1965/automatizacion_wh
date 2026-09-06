import type { ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
  username?: string;
  onLogout?: () => void;
};

export function AppShell({ children, username, onLogout }: AppShellProps) {
  return (
    <div className="app-shell">
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
        <h1>Camila Operaciones</h1>
      </header>
      <main>{children}</main>
    </div>
  );
}
