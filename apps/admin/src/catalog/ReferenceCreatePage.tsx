import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createReference } from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { ReferenceForm, type ReferenceFormValues } from './ReferenceForm';

const MAX_PRICE_COP = 2_000_000_000;

export function ReferenceCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();

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
      const created = await createReference({
        code: values.code,
        modelName: values.modelName,
        color: values.color,
        priceCop,
      });
      void navigate(`/references/${created.id}`);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, 'No se pudo crear la referencia'));
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
      />
    </section>
  );
}
