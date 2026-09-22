import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { listReferences, type ReferenceSummary } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { getCatalogReadiness } from '../api/catalog-import-api';
import { Button as UiButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
    <section aria-labelledby="catalog-title" className="space-y-6">
      <PageHeader
        eyebrow="Producto"
        title="Catálogo"
        titleId="catalog-title"
        description="Referencias listas para WhatsApp: foto, tallas y disponibilidad."
        actions={
          <UiButton asChild className="control-target h-11 rounded-[1.125rem]">
            <Link to="/references/new">Nueva referencia</Link>
          </UiButton>
        }
      />
      {readinessQuery.data ? (
        <section
          aria-label="Preparación del piloto"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {(
            [
              ['Total', readinessQuery.data.total],
              ['Activas', readinessQuery.data.active],
              ['Sin foto', readinessQuery.data.withoutPhoto],
              ['Sin stock', readinessQuery.data.withoutAvailableStock],
              ['Listas', readinessQuery.data.ready],
            ] as const
          ).map(([label, value]) => (
            <article
              key={label}
              className="rounded-3xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]"
            >
              <span className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                {label}
              </span>
              <strong className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">
                {value}
              </strong>
            </article>
          ))}
        </section>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={onSearch}
      >
        <label className="sr-only" htmlFor="search">
          Buscar
        </label>
        <Input
          id="search"
          name="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Código, modelo o color"
          className="h-11 rounded-[1.125rem] bg-muted sm:max-w-md"
        />
        <Button type="submit" variant="secondary" className="h-11">
          Buscar
        </Button>
      </form>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Estado del catálogo"
      >
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
            className={cn(
              'control-target inline-flex h-9 items-center rounded-[1.125rem] border px-3 text-sm font-medium transition-colors',
              status === value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
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
        <EmptyState
          title="No hay referencias con estos filtros"
          description="Prueba otra búsqueda o cambia el estado del catálogo."
        />
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
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/references/${item.id}`}
              className="flex gap-4 rounded-3xl border border-border bg-card p-3 shadow-[var(--shadow-card)] transition-colors hover:bg-muted/40"
            >
              {item.photo !== null ? (
                <img
                  className="size-16 shrink-0 rounded-[1.125rem] object-cover"
                  src={item.photo.url}
                  alt={`Fotografía de ${item.code} ${item.modelName}`}
                />
              ) : (
                <span
                  className="flex size-16 shrink-0 items-center justify-center rounded-[1.125rem] border border-dashed border-border bg-muted text-center text-[0.65rem] text-muted-foreground"
                  aria-hidden="true"
                >
                  Sin foto
                </span>
              )}
              <span className="min-w-0 flex-1 space-y-2">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="font-mono text-sm font-semibold tracking-tight text-foreground">
                    {item.code}
                  </strong>
                  <span className="text-sm text-foreground">
                    {item.modelName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.color}
                  </span>
                  <StatusBadge tone={item.active ? 'success' : 'neutral'}>
                    {item.active ? 'Activa' : 'Inactiva'}
                  </StatusBadge>
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{item.priceCop.toLocaleString('es-CO')} COP</span>
                  <span>
                    {item.availableSizes.length > 0
                      ? `Tallas ${item.availableSizes.join(', ')}`
                      : 'Sin tallas disponibles'}
                  </span>
                  <span>
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
        <Button
          type="button"
          variant="secondary"
          className="h-11"
          onClick={() => {
            void loadMore();
          }}
          loading={loadingMore}
        >
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </Button>
      ) : null}
    </div>
  );
}
