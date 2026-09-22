import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';

import { listReferences } from '../api/catalog-api';
import { listConversations } from '../api/conversations-api';
import { listOrders } from '../api/orders-api';
import { Input } from '@/components/ui/input';

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const source = useQuery({
    queryKey: ['global-search-source'],
    staleTime: 60_000,
    queryFn: async () => {
      const [referencesPage, ordersPage, conversationsPage] = await Promise.all(
        [
          listReferences({ limit: 100, status: 'all' }),
          listOrders(),
          listConversations(),
        ],
      );
      const references = [...referencesPage.items];
      const orders = [...ordersPage.items];
      const conversations = [...conversationsPage.items];
      let afterCode = referencesPage.nextAfterCode;
      let orderCursor = ordersPage.nextCursor;
      let conversationCursor = conversationsPage.nextCursor;
      for (let page = 0; page < 9; page += 1) {
        if (!afterCode && !orderCursor && !conversationCursor) break;
        const [nextReferences, nextOrders, nextConversations] =
          await Promise.all([
            afterCode
              ? listReferences({
                  limit: 100,
                  status: 'all',
                  afterCode,
                })
              : Promise.resolve(null),
            orderCursor
              ? listOrders(undefined, undefined, orderCursor)
              : Promise.resolve(null),
            conversationCursor
              ? listConversations(conversationCursor)
              : Promise.resolve(null),
          ]);
        if (nextReferences) {
          references.push(...nextReferences.items);
          afterCode = nextReferences.nextAfterCode;
        }
        if (nextOrders) {
          orders.push(...nextOrders.items);
          orderCursor = nextOrders.nextCursor;
        }
        if (nextConversations) {
          conversations.push(...nextConversations.items);
          conversationCursor = nextConversations.nextCursor;
        }
      }
      return { orders, conversations, references };
    },
  });
  const needle = query.trim().toLocaleLowerCase('es-CO');

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
  const results = useMemo(
    () =>
      !source.data || needle.length < 2
        ? []
        : [
            ...source.data.orders.map((x) => ({
              key: x.id,
              kind: 'Pedido',
              label: `${x.orderNumber} · ${x.customer.name ?? x.customer.phone ?? 'Cliente'}`,
              to: `/orders/${x.id}`,
            })),
            ...source.data.conversations.map((x) => ({
              key: x.id,
              kind: 'Conversación',
              label: x.customerPhone,
              to: `/conversations?conversation=${x.id}`,
            })),
            ...source.data.references.map((x) => ({
              key: x.id,
              kind: 'Referencia',
              label: `${x.code} · ${x.modelName} · ${x.color}`,
              to: `/references/${x.id}`,
            })),
          ]
            .filter((x) => x.label.toLocaleLowerCase('es-CO').includes(needle))
            .slice(0, 12),
    [source.data, needle],
  );

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
        <div className="max-h-80 overflow-y-auto p-3">
          {needle.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Escribe al menos dos caracteres.
            </p>
          ) : results.length ? (
            <ul className="space-y-1">
              {results.map((x) => (
                <li key={`${x.kind}-${x.key}`}>
                  <Link
                    to={x.to}
                    onClick={onClose}
                    className="flex flex-col gap-0.5 rounded-[1.125rem] px-3 py-2 hover:bg-muted"
                  >
                    <small className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {x.kind}
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
