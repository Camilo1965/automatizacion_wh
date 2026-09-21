import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type AuthShellProps = {
  children: ReactNode;
  className?: string;
};

export function AuthShell({ children, className }: AuthShellProps) {
  return (
    <main
      className={cn(
        'auth-shell flex min-h-svh items-center justify-center bg-background px-4 py-8',
        className,
      )}
    >
      <div className="auth-stage w-full max-w-5xl">{children}</div>
    </main>
  );
}
