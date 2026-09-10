import type { ReactNode } from 'react';
import { DesktopSidebar } from './DesktopSidebar';
import { GlobalHeader } from './GlobalHeader';
import { MobileNavigation } from './MobileNavigation';

type AppShellProps = {
  children: ReactNode;
  username?: string;
  onLogout?: () => void;
};

export function AppShell({ children, username, onLogout }: AppShellProps) {
  return (
    <div className="app-shell">
      {username !== undefined ? <DesktopSidebar /> : null}
      <div className="app-content">
        {username !== undefined && onLogout !== undefined ? (
          <GlobalHeader username={username} onLogout={onLogout} />
        ) : (
          <header className="app-header">
            <p className="environment-badge">Entorno local</p>
            <h1>Camila Operaciones</h1>
          </header>
        )}
        <main>{children}</main>
        {username !== undefined ? <MobileNavigation /> : null}
      </div>
    </div>
  );
}
