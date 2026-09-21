import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { listReferences, type ReferenceSummary } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { getCatalogReadiness } from '../api/catalog-import-api';

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
  const readinessQuery = useQuery({
    queryKey: ['catalog-readiness'],
    queryFn: getCatalogReadiness,
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  return (
    <section aria-labelledby="catalog-title" className="catalog-page">
      <PageHeader
        eyebrow="Producto"
        title="Catálogo"
        titleId="catalog-title"
        description="Referencias listas para WhatsApp: foto, tallas y disponibilidad."
        actions={
          <Link
            className="ui-button ui-button--primary control-target"
            to="/references/new"
          >
            Nueva referencia
          </Link>
        }
      />
      {readinessQuery.data ? (
        <section
          aria-label="Preparación del piloto"
          className="readiness-strip"
        >
          <article>
            <span>Total</span>
            <strong>{readinessQuery.data.total}</strong>
          </article>
          <article>
            <span>Activas</span>
            <strong>{readinessQuery.data.active}</strong>
          </article>
          <article>
            <span>Sin foto</span>
            <strong>{readinessQuery.data.withoutPhoto}</strong>
          </article>
          <article>
            <span>Sin stock</span>
            <strong>{readinessQuery.data.withoutAvailableStock}</strong>
          </article>
          <article>
            <span>Listas</span>
            <strong>{readinessQuery.data.ready}</strong>
          </article>
        </section>
      ) : null}

      <form className="catalog-search" onSubmit={onSearch}>
        <label className="sr-only" htmlFor="search">
          Buscar
        </label>
        <input
          id="search"
          name="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Código, modelo o color"
        />
        <button
          type="submit"
          className="ui-button ui-button--secondary control-target"
        >
          Buscar
        </button>
      </form>
      <div className="view-chips" role="group" aria-label="Estado del catálogo">
        {(
          [
            ['active', 'Activas'],
            ['inactive', 'Inactivas'],
            ['all', 'Todas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              status === value ? 'view-chip view-chip--active' : 'view-chip'
            }
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

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
      <ul className="reference-list reference-list--rows">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/references/${item.id}`} className="reference-row">
              {item.photo !== null ? (
                <img
                  className="reference-thumb"
                  src={item.photo.url}
                  alt={`Fotografía de ${item.code} ${item.modelName}`}
                />
              ) : (
                <span
                  className="reference-thumb reference-thumb--empty"
                  aria-hidden="true"
                >
                  Sin foto
                </span>
              )}
              <span className="reference-row-body">
                <span className="reference-row-title">
                  <strong className="reference-code">{item.code}</strong>
                  <span>{item.modelName}</span>
                  <span className="muted">{item.color}</span>
                </span>
                <span className="reference-row-meta">
                  <span>{item.priceCop.toLocaleString('es-CO')} COP</span>
                  <span>{item.active ? 'Activa' : 'Inactiva'}</span>
                  <span>
                    {item.availableSizes.length > 0
                      ? `Tallas ${item.availableSizes.join(', ')}`
                      : 'Sin tallas disponibles'}
                  </span>
                  <span className="muted">
                    {new Date(item.updatedAt).toLocaleString('es-CO')}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ErrorMessage message={error} />
      {nextAfterCode !== null ? (
        <button
          type="button"
          className="ui-button ui-button--secondary control-target"
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
