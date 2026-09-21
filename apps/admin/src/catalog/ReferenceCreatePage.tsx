import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  activateReference,
  createReference,
  deactivateReference,
  setStock,
  updateReference,
  uploadReferencePhoto,
} from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { ReferenceForm, type ReferenceFormValues } from './ReferenceForm';
import { FileDropzone } from '../components/FileDropzone';

const MAX_PRICE_COP = 2_000_000_000;
const MAX_STOCK_QUANTITY = 2_000_000_000;
const INITIAL_SIZES = ['35', '36', '37', '38', '39', '40', '41'];

export function ReferenceCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [photo, setPhoto] = useState<File | null>(null);
  const [pendingReferenceId, setPendingReferenceId] = useState<string | null>(
    null,
  );
  const [stock, setStockValues] = useState<Record<string, string>>(
    Object.fromEntries(INITIAL_SIZES.map((size) => [size, ''])),
  );

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
    if (photo === null) {
      setErrorMessage('Carga una fotografía antes de crear la referencia');
      setSubmitting(false);
      return;
    }
    const stockRows = Object.entries(stock).map(([size, raw]) => {
      const value =
        raw.trim() === ''
          ? 0
          : parseIntegerDigits(raw, { min: 0, max: MAX_STOCK_QUANTITY });
      return { size, physicalQuantity: value };
    });
    if (stockRows.some((row) => row.physicalQuantity === null)) {
      setErrorMessage('Las existencias deben ser enteros positivos o cero');
      setSubmitting(false);
      return;
    }
    const initialStock = stockRows.filter(
      (row): row is { size: string; physicalQuantity: number } =>
        row.physicalQuantity !== null && row.physicalQuantity > 0,
    );
    if (initialStock.length === 0) {
      setErrorMessage(
        'Agrega al menos una talla con existencias antes de publicar',
      );
      setSubmitting(false);
      return;
    }

    let referenceId = pendingReferenceId;
    try {
      if (referenceId === null) {
        const created = await createReference({
          code: values.code,
          modelName: values.modelName,
          color: values.color,
          priceCop,
        });
        referenceId = created.id;
        await deactivateReference(referenceId);
        setPendingReferenceId(referenceId);
      } else {
        await updateReference(referenceId, {
          modelName: values.modelName,
          color: values.color,
          priceCop,
        });
      }
      const savedReferenceId = referenceId;
      await uploadReferencePhoto(savedReferenceId, photo);
      await Promise.all(
        initialStock.map((row) =>
          setStock(savedReferenceId, row.size, {
            physicalQuantity: row.physicalQuantity,
            note: 'Stock inicial al crear referencia',
          }),
        ),
      );
      await activateReference(savedReferenceId);
      void navigate(`/references/${savedReferenceId}`);
    } catch (err) {
      if (referenceId !== null && pendingReferenceId === null) {
        await deactivateReference(referenceId).catch(() => undefined);
      }
      setErrorMessage(
        getErrorMessage(
          err,
          pendingReferenceId
            ? 'La referencia está guardada como inactiva. Reintenta la fotografía.'
            : 'No se pudo crear la referencia',
        ),
      );
      setFieldError(getFieldError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="create-title" className="catalog-wizard">
      <div className="section-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h2 id="create-title">Nueva referencia</h2>
        </div>
        <Link
          className="ui-button ui-button--secondary control-target"
          to="/catalog"
        >
          Volver
        </Link>
      </div>
      <ol className="wizard-steps" aria-label="Pasos de publicación">
        <li className="wizard-step wizard-step--active">
          <span>1</span>
          Identidad y precio
        </li>
        <li className="wizard-step wizard-step--active">
          <span>2</span>
          Fotografía
        </li>
        <li className="wizard-step wizard-step--active">
          <span>3</span>
          Tallas y stock
        </li>
        <li className="wizard-step">
          <span>4</span>
          Publicar
        </li>
      </ol>
      <ReferenceForm
        mode="create"
        initialValues={{
          code: '',
          modelName: '',
          color: '',
          priceCop: '',
        }}
        submitting={submitting}
        errorMessage={errorMessage}
        {...(fieldError === undefined ? {} : { fieldError })}
        onSubmit={onSubmit}
      >
        <div className="wizard-panel">
          <h3>Fotografía principal</h3>
          <FileDropzone
            accept={['image/jpeg', 'image/png']}
            label="Fotografía principal"
            maxBytes={5 * 1024 * 1024}
            onFile={setPhoto}
            disabled={submitting}
          />
          {photo ? (
            <p className="muted">Seleccionada: {photo.name}</p>
          ) : (
            <p className="muted">JPEG o PNG, máximo 5 MB.</p>
          )}
        </div>
        <section className="wizard-panel" aria-labelledby="initial-stock-title">
          <h3 id="initial-stock-title">Tallas y existencias</h3>
          <p className="muted">
            Publicación requiere foto válida y al menos una talla con unidades.
          </p>
          <div className="stock-size-grid">
            {INITIAL_SIZES.map((size) => (
              <label key={size}>
                Talla {size}
                <input
                  inputMode="numeric"
                  min={0}
                  value={stock[size] ?? ''}
                  onChange={(event) =>
                    setStockValues((current) => ({
                      ...current,
                      [size]: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </section>
      </ReferenceForm>
    </section>
  );
}
