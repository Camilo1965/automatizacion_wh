import { useCallback, useMemo, type ReactNode } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';

import { ToastContext } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback(
    (message: string, tone: 'success' | 'danger' = 'success') => {
      if (tone === 'danger') {
        sonnerToast.error(message);
        return;
      }
      sonnerToast.success(message);
    },
    [],
  );
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-right"
        theme="light"
        richColors={false}
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'rounded-[1.125rem] border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]',
            title: 'text-sm font-medium text-foreground',
            description: 'text-sm text-muted-foreground',
            success: 'border-border',
            error: 'border-destructive/40 text-destructive',
          },
        }}
      />
    </ToastContext.Provider>
  );
}
