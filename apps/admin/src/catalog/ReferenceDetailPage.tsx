import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  activateReference,
  deactivateReference,
  getReference,
  updateReference,
} from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader, PageSection } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { MovementHistory } from './MovementHistory';
import { PhotoEditor } from './PhotoEditor';
import { ReferenceForm, type ReferenceFormValues } from './ReferenceForm';
import { StockEditor } from './StockEditor';
import { Button as UiButton } from '@/components/ui/button';

const MAX_PRICE_COP = 2_000_000_000;

export function ReferenceDetailPage() {
  const { referenceId = '' } = useParams();
  const queryClient = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  const detailQuery = useQuery({
    queryKey: ['reference', referenceId],
    queryFn: () => getReference(referenceId),
    enabled: referenceId !== '',
  });

  function refreshAll() {
    void queryClient.invalidateQueries({
      queryKey: ['reference', referenceId],
    });
    void queryClient.invalidateQueries({ queryKey: ['references'] });
    setRefreshKey((value) => value + 1);
  }

  async function onSubmit(values: ReferenceFormValues) {
    setSubmitting(true);
    setErrorMessage('');
    setFieldError(undefined);
    const priceCop = parseIntegerDigits(values.priceCop, {
      min: 1,
      max: MAX_PRICE_COP,
    });
    if (priceCop === null) {
      setErrorMessage('El precio debe ser un entero positivo');
      setFieldError('priceCop');
      setSubmitting(false);
      return;
    }

    try {
      await updateReference(referenceId, {
        modelName: values.modelName,
        color: values.color,
        priceCop,
      });
      refreshAll();
    } catch (err) {
      setErrorMessage(getErrorMessage(err, 'No se pudo guardar'));
      setFieldError(getFieldError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeactivate() {
    setStatusBusy(true);
    setStatusError('');
    try {
      await deactivateReference(referenceId);
      setConfirmOpen(false);
      refreshAll();
    } catch (err) {
      setStatusError(getErrorMessage(err, 'No se pudo desactivar'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function onActivate() {
    setStatusBusy(true);
    setStatusError('');
    try {
      await activateReference(referenceId);
      refreshAll();
    } catch (err) {
      setStatusError(getErrorMessage(err, 'No se pudo activar'));
    } finally {
      setStatusBusy(false);
    }
  }

  if (detailQuery.isLoading) {
    return <LoadingState label="Cargando referencia…" />;
  }

  if (detailQuery.isError || detailQuery.data === undefined) {
    return (
      <ErrorMessage
        message={getErrorMessage(
          detailQuery.error,
          'No se pudo cargar la referencia',
        )}
      />
    );
  }

  const detail = detailQuery.data;

  return (
    <section aria-labelledby="detail-title" className="space-y-6">
      <PageHeader
        title={`Referencia ${detail.code}`}
        titleId="detail-title"
        actions={
          <UiButton
            asChild
            variant="secondary"
            className="control-target h-11 rounded-[1.125rem]"
          >
            <Link to="/catalog">Volver al catálogo</Link>
          </UiButton>
        }
      />

      <p role="status">
        <StatusBadge tone={detail.active ? 'success' : 'neutral'}>
          {detail.active ? 'Activa' : 'Inactiva'}
        </StatusBadge>
      </p>

      <PageSection>
        <ReferenceForm
          mode="edit"
          initialValues={{
            code: detail.code,
            modelName: detail.modelName,
            color: detail.color,
            priceCop: String(detail.priceCop),
          }}
          submitting={submitting}
          errorMessage={errorMessage}
          {...(fieldError === undefined ? {} : { fieldError })}
          onSubmit={onSubmit}
        />
      </PageSection>

      <div className="flex flex-wrap items-center gap-3">
        {detail.active ? (
          <Button
            type="button"
            variant="danger"
            className="h-11"
            onClick={() => setConfirmOpen(true)}
            disabled={statusBusy}
            loading={statusBusy}
          >
            Desactivar
          </Button>
        ) : (
          <Button
            type="button"
            className="h-11"
            onClick={() => {
              void onActivate();
            }}
            disabled={statusBusy}
            loading={statusBusy}
          >
            Reactivar
          </Button>
        )}
        <ErrorMessage message={statusError} id="status-error" />
      </div>

      <PhotoEditor
        referenceId={detail.id}
        currentPhotoUrl={detail.photo?.url ?? null}
        onUploaded={refreshAll}
      />

      <PageSection aria-labelledby="stock-list-title" className="space-y-3">
        <h3
          id="stock-list-title"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          Existencias
        </h3>
        {detail.stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin tallas registradas
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Existencias">
            {detail.stock.map((item) => (
              <li
                key={item.size}
                className="rounded-[1.125rem] border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                {`Talla ${item.size}: ${item.physicalQuantity} físicas · ${item.reservedQuantity} reservadas · ${item.availableQuantity} disponibles · ${new Date(item.updatedAt).toLocaleString('es-CO')}`}
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <StockEditor
        referenceId={detail.id}
        stock={detail.stock}
        onSaved={refreshAll}
      />
      <MovementHistory referenceId={detail.id} refreshKey={refreshKey} />

      <ConfirmDialog
        open={confirmOpen}
        title="Desactivar referencia"
        message="¿Desactivar esta referencia? Dejará de aparecer en búsquedas activas."
        confirmLabel="Desactivar"
        onConfirm={() => {
          void confirmDeactivate();
        }}
        onCancel={() => setConfirmOpen(false)}
        busy={statusBusy}
      />
    </section>
  );
}
