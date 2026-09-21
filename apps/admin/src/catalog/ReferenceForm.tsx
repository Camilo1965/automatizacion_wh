import { useState, type FormEvent, type ReactNode } from 'react';

import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
const inputClass = 'h-11 rounded-[1.125rem] bg-muted';

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
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">Código</Label>
        <Input
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
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="modelName">Modelo</Label>
        <Input
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
          aria-describedby={
            fieldError === 'modelName' ? describedBy : undefined
          }
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="color">Color</Label>
        <Input
          id="color"
          name="color"
          value={values.color}
          onChange={(event) =>
            setValues((current) => ({ ...current, color: event.target.value }))
          }
          required
          aria-invalid={fieldError === 'color'}
          aria-describedby={fieldError === 'color' ? describedBy : undefined}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="priceCop">Precio (COP)</Label>
        <Input
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
          className={inputClass}
        />
      </div>

      {children}

      <ErrorMessage message={errorMessage} id={FORM_ERROR_ID} />

      <Button type="submit" className="h-11" loading={submitting}>
        {submitting
          ? 'Guardando…'
          : mode === 'create'
            ? 'Crear referencia'
            : 'Guardar cambios'}
      </Button>
    </form>
  );
}
