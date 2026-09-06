import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { listReferences, type ReferenceSummary } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';

type StatusFilter = 'active' | 'inactive' | 'all';

export function CatalogListPage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');

  const listQuery = useQuery({
    queryKey: ['references', query, status],
    queryFn: () =>
      listReferences({
        ...(query === '' ? {} : { query }),
        status,
        limit: 25,
      }),
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  function onStatusChange(next: StatusFilter) {
    setStatus(next);
  }

  return (
    <section aria-labelledby="catalog-title">
      <div className="section-header">
        <h2 id="catalog-title">Catálogo</h2>
        <Link className="button-primary" to="/references/new">
          Nueva referencia
        </Link>
      </div>

      <form className="filters" onSubmit={onSearch}>
        <label htmlFor="search">Buscar</label>
        <input
          id="search"
          name="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Código, modelo o color"
        />
        <button type="submit" className="button-secondary">
          Buscar
        </button>

        <label htmlFor="status">Estado</label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as StatusFilter)
          }
        >
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </select>
      </form>

      {listQuery.isLoading ? <LoadingState /> : null}
      {listQuery.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            listQuery.error,
            'No se pudo cargar el catálogo',
          )}
        />
      ) : null}

      {listQuery.isSuccess && listQuery.data.items.length === 0 ? (
        <p className="muted" role="status">
          No hay referencias con estos filtros
        </p>
      ) : null}

      {listQuery.isSuccess && listQuery.data.items.length > 0 ? (
        <CatalogPagedList
          key={`${query}-${status}-${listQuery.dataUpdatedAt}`}
          firstPage={listQuery.data.items}
          firstNextAfterCode={listQuery.data.nextAfterCode}
          query={query}
          status={status}
        />
      ) : null}
    </section>
  );
}

function CatalogPagedList({
  firstPage,
  firstNextAfterCode,
  query,
  status,
}: {
  firstPage: ReferenceSummary[];
  firstNextAfterCode: string | null;
  query: string;
  status: StatusFilter;
}) {
  const [items, setItems] = useState(firstPage);
  const [nextAfterCode, setNextAfterCode] = useState(firstNextAfterCode);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function loadMore() {
    if (nextAfterCode === null) {
      return;
    }
    setLoadingMore(true);
    setError('');
    try {
      const page = await listReferences({
        ...(query === '' ? {} : { query }),
        status,
        afterCode: nextAfterCode,
        limit: 25,
      });
      setItems((current) => [...current, ...page.items]);
      setNextAfterCode(page.nextAfterCode);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar más'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <ul className="reference-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/references/${item.id}`}>
              <span className="reference-code">{item.code}</span>
              <span>
                {item.modelName} · {item.color}
              </span>
              <span className="muted">
                {item.active ? 'Activa' : 'Inactiva'} ·{' '}
                {item.priceCop.toLocaleString('es-CO')} COP
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ErrorMessage message={error} />
      {nextAfterCode !== null ? (
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            void loadMore();
          }}
          disabled={loadingMore}
        >
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </button>
      ) : null}
    </>
  );
}
