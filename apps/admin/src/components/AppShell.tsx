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
        ) : null}
        <main>{children}</main>
        {username !== undefined ? <MobileNavigation /> : null}
      </div>
    </div>
  );
}
