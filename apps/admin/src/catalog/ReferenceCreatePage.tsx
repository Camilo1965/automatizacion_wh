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
import { PageHeader, PageSection } from '../components/PageHeader';
import { Button as UiButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
    <section aria-labelledby="create-title" className="space-y-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Nueva referencia"
        titleId="create-title"
        actions={
          <UiButton
            asChild
            variant="secondary"
            className="control-target h-11 rounded-[1.125rem]"
          >
            <Link to="/catalog">Volver</Link>
          </UiButton>
        }
      />
      <ol
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        aria-label="Pasos de publicación"
      >
        {(
          [
            [1, 'Identidad y precio', true],
            [2, 'Fotografía', true],
            [3, 'Tallas y stock', true],
            [4, 'Publicar', false],
          ] as const
        ).map(([n, label, active]) => (
          <li
            key={n}
            className={cn(
              'inline-flex items-center gap-2 rounded-[1.125rem] border px-3 py-2 text-sm',
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            <span className="font-mono text-xs">{n}</span>
            {label}
          </li>
        ))}
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
        <PageSection className="space-y-3">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Fotografía principal
          </h3>
          <FileDropzone
            accept={['image/jpeg', 'image/png']}
            label="Fotografía principal"
            maxBytes={5 * 1024 * 1024}
            onFile={setPhoto}
            disabled={submitting}
          />
          {photo ? (
            <p className="text-sm text-muted-foreground">
              Seleccionada: {photo.name}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              JPEG o PNG, máximo 5 MB.
            </p>
          )}
        </PageSection>
        <PageSection
          className="space-y-3"
          aria-labelledby="initial-stock-title"
        >
          <h3
            id="initial-stock-title"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Tallas y existencias
          </h3>
          <p className="text-sm text-muted-foreground">
            Publicación requiere foto válida y al menos una talla con unidades.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {INITIAL_SIZES.map((size) => (
              <div key={size} className="space-y-2">
                <Label htmlFor={`stock-${size}`}>Talla {size}</Label>
                <Input
                  id={`stock-${size}`}
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
                  className="h-11 rounded-[1.125rem] bg-muted"
                />
              </div>
            ))}
          </div>
        </PageSection>
      </ReferenceForm>
    </section>
  );
}
