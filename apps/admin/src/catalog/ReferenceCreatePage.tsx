import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  activateReference,
  createReference,
  deactivateReference,
  uploadReferencePhoto,
} from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { ReferenceForm, type ReferenceFormValues } from './ReferenceForm';
import { FileDropzone } from '../components/FileDropzone';

const MAX_PRICE_COP = 2_000_000_000;

export function ReferenceCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [photo, setPhoto] = useState<File | null>(null);
  const [pendingReferenceId, setPendingReferenceId] = useState<string | null>(
    null,
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
      }
      await uploadReferencePhoto(referenceId, photo);
      await activateReference(referenceId);
      void navigate(`/references/${referenceId}`);
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
    <section aria-labelledby="create-title">
      <div className="section-header">
        <h2 id="create-title">Nueva referencia</h2>
        <Link className="button-secondary" to="/catalog">
          Volver
        </Link>
      </div>
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
        <FileDropzone
          accept={['image/jpeg', 'image/png']}
          label="Fotografía principal"
          maxBytes={5 * 1024 * 1024}
          onFile={setPhoto}
          disabled={submitting}
        />
        {photo ? <p className="muted">Seleccionada: {photo.name}</p> : null}
      </ReferenceForm>
    </section>
  );
}
