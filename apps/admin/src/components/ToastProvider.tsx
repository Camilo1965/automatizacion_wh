import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ToastContext } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    tone: 'success' | 'danger';
  } | null>(null);
  const showToast = useCallback(
    (message: string, tone: 'success' | 'danger' = 'success') =>
      setToast({ message, tone }),
    [],
  );
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div className={`toast toast--${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button
            aria-label="Cerrar notificación"
            className="toast-close control-target"
            onClick={() => setToast(null)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
