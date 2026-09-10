import { createContext, useContext } from 'react';

export type ToastContextValue = {
  showToast: (message: string, tone?: 'success' | 'danger') => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
