import { useState, type FormEvent, type ReactNode } from 'react';

import { ErrorMessage } from '../components/ErrorMessage';

type ReferenceFormValues = {
  code: string;
  modelName: string;
  color: string;
  priceCop: string;
};

type ReferenceFormProps = {
  mode: 'create' | 'edit';
  initialValues: ReferenceFormValues;
  submitting?: boolean;
  errorMessage?: string;
  fieldError?: string;
  onSubmit: (values: ReferenceFormValues) => Promise<void> | void;
  children?: ReactNode;
};

export type { ReferenceFormValues };

const FORM_ERROR_ID = 'reference-form-error';

export function ReferenceForm({
  mode,
  initialValues,
  submitting = false,
  errorMessage = '',
  fieldError,
  onSubmit,
  children,
}: ReferenceFormProps) {
  const [values, setValues] = useState(initialValues);
  const describedBy =
    errorMessage !== '' && fieldError !== undefined ? FORM_ERROR_ID : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="code">Código</label>
      <input
        id="code"
        name="code"
        value={values.code}
        onChange={(event) =>
          setValues((current) => ({ ...current, code: event.target.value }))
        }
        disabled={mode === 'edit'}
        required
        aria-invalid={fieldError === 'code'}
        aria-describedby={fieldError === 'code' ? describedBy : undefined}
      />

      <label htmlFor="modelName">Modelo</label>
      <input
        id="modelName"
        name="modelName"
        value={values.modelName}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            modelName: event.target.value,
          }))
        }
        required
        aria-invalid={fieldError === 'modelName'}
        aria-describedby={fieldError === 'modelName' ? describedBy : undefined}
      />

      <label htmlFor="color">Color</label>
      <input
        id="color"
        name="color"
        value={values.color}
        onChange={(event) =>
          setValues((current) => ({ ...current, color: event.target.value }))
        }
        required
        aria-invalid={fieldError === 'color'}
        aria-describedby={fieldError === 'color' ? describedBy : undefined}
      />

      <label htmlFor="priceCop">Precio (COP)</label>
      <input
        id="priceCop"
        name="priceCop"
        inputMode="numeric"
        value={values.priceCop}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            priceCop: event.target.value,
          }))
        }
        required
        aria-invalid={fieldError === 'priceCop'}
        aria-describedby={fieldError === 'priceCop' ? describedBy : undefined}
      />

      {children}

      <ErrorMessage message={errorMessage} id={FORM_ERROR_ID} />

      <button type="submit" className="button-primary" disabled={submitting}>
        {submitting
          ? 'Guardando…'
          : mode === 'create'
            ? 'Crear referencia'
            : 'Guardar cambios'}
      </button>
    </form>
  );
}
