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
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { MovementHistory } from './MovementHistory';
import { PhotoEditor } from './PhotoEditor';
import { ReferenceForm, type ReferenceFormValues } from './ReferenceForm';
import { StockEditor } from './StockEditor';

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
    <section aria-labelledby="detail-title">
      <div className="section-header">
        <h2 id="detail-title">
          Referencia <span className="reference-code">{detail.code}</span>
        </h2>
        <Link className="button-secondary" to="/catalog">
          Volver al catálogo
        </Link>
      </div>

      <p className="status-pill" role="status">
        {detail.active ? 'Activa' : 'Inactiva'}
      </p>

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

      <div className="status-actions">
        {detail.active ? (
          <button
            type="button"
            className="button-danger"
            onClick={() => setConfirmOpen(true)}
            disabled={statusBusy}
          >
            Desactivar
          </button>
        ) : (
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              void onActivate();
            }}
            disabled={statusBusy}
          >
            Reactivar
          </button>
        )}
        <ErrorMessage message={statusError} id="status-error" />
      </div>

      <PhotoEditor
        referenceId={detail.id}
        currentPhotoUrl={detail.photo?.url ?? null}
        onUploaded={refreshAll}
      />

      <section className="panel-block" aria-labelledby="stock-list-title">
        <h3 id="stock-list-title">Existencias</h3>
        {detail.stock.length === 0 ? (
          <p className="muted">Sin tallas registradas</p>
        ) : (
          <ul className="stock-list" aria-label="Existencias">
            {detail.stock.map((item) => (
              <li key={item.size}>
                Talla {item.size}: {item.physicalQuantity} físicas ·{' '}
                {item.reservedQuantity} reservadas · {item.availableQuantity}{' '}
                disponibles · {new Date(item.updatedAt).toLocaleString('es-CO')}
              </li>
            ))}
          </ul>
        )}
      </section>

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
