import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { GlobalSearchResponseSchema } from '@camila/contracts';

import { apiRequest, getErrorMessage } from '../api/client';
import { Input } from '@/components/ui/input';

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const needle = debouncedQuery;
  const search = useQuery({
    queryKey: ['global-search', needle],
    enabled: needle.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({ q: needle, limit: '12' });
      return apiRequest(`/search?${params}`, {
        schema: GlobalSearchResponseSchema,
      });
    },
  });

  useLayoutEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const background = [
      document.querySelector('main'),
      document.querySelector('aside'),
      document.querySelector('[aria-label="Accesos móviles"]'),
      document.querySelector('header'),
    ].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    background.forEach((element) => element.setAttribute('inert', ''));
    return () => {
      background.forEach((element) => element.removeAttribute('inert'));
      const trigger = restoreFocusRef.current?.isConnected
        ? restoreFocusRef.current
        : document.querySelector<HTMLElement>(
            '[aria-label="Abrir búsqueda global"]',
          );
      trigger?.focus();
    };
  }, []);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const kindLabel = {
    order: 'Pedido',
    conversation: 'Conversación',
    reference: 'Referencia',
  } as const;

  const results = search.data?.data.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 p-4 pt-[12vh] backdrop-blur-sm">
      <section
        ref={dialogRef}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        onKeyDown={trapFocus}
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cliente, teléfono, pedido o referencia"
            aria-label="Buscar en KAIRO"
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            aria-label="Cerrar búsqueda"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-[0.75rem] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="max-h-80 overflow-y-auto p-3" aria-live="polite">
          {needle.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Escribe al menos dos caracteres.
            </p>
          ) : search.isLoading ? (
            <p className="text-sm text-muted-foreground">Buscando…</p>
          ) : search.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(
                search.error,
                'No fue posible buscar. Intenta de nuevo.',
              )}
            </p>
          ) : results.length ? (
            <ul className="space-y-1">
              {results.map((x) => (
                <li key={`${x.kind}-${x.id}`}>
                  <Link
                    to={x.href}
                    onClick={onClose}
                    className="flex flex-col gap-0.5 rounded-[1.125rem] px-3 py-2 hover:bg-muted"
                  >
                    <small className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {kindLabel[x.kind]}
                    </small>
                    <strong className="text-sm font-medium text-foreground">
                      {x.label}
                    </strong>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No encontramos resultados.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
