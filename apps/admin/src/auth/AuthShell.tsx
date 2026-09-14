import type { ReactNode } from 'react';

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-stage">{children}</div>
    </main>
  );
}
