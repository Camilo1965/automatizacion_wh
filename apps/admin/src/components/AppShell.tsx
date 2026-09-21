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
  const authenticated = username !== undefined;

  return (
    <div className="flex min-h-svh bg-background">
      {authenticated ? <DesktopSidebar /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {authenticated && onLogout !== undefined ? (
          <GlobalHeader username={username} onLogout={onLogout} />
        ) : null}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-24 md:px-6 md:pb-8 lg:px-8">
          {children}
        </main>
        {authenticated ? <MobileNavigation /> : null}
      </div>
    </div>
  );
}
