import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listReferences } from '../api/catalog-api';
import { listConversations } from '../api/conversations-api';
import { listOrders } from '../api/orders-api';

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const source = useQuery({
    queryKey: ['global-search-source'],
    queryFn: async () => {
      const [orders, conversations, references] = await Promise.all([
        listOrders(),
        listConversations(),
        listReferences({ limit: 100 }),
      ]);
      return { orders, conversations, references: references.items };
    },
  });
  const needle = query.trim().toLocaleLowerCase('es-CO');
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
    <div className="search-backdrop">
      <section
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
      >
        <header>
          <Search aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cliente, teléfono, pedido o referencia"
            aria-label="Buscar en KAIRO"
          />
          <button type="button" aria-label="Cerrar búsqueda" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {needle.length < 2 ? (
          <p className="muted">Escribe al menos dos caracteres.</p>
        ) : results.length ? (
          <ul>
            {results.map((x) => (
              <li key={`${x.kind}-${x.key}`}>
                <Link to={x.to} onClick={onClose}>
                  <small>{x.kind}</small>
                  <strong>{x.label}</strong>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No encontramos resultados.</p>
        )}
      </section>
    </div>
  );
}
