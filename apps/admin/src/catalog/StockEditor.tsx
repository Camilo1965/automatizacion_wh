import { useState, type FormEvent } from 'react';

import { setStock } from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

type StockEditorProps = {
  referenceId: string;
  onSaved: () => void;
};

export function StockEditor({ referenceId, onSaved }: StockEditorProps) {
  const [size, setSize] = useState('37');
  const [quantity, setQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFieldError(undefined);
    const physicalQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(physicalQuantity) || physicalQuantity < 0) {
      setError('La cantidad debe ser un entero mayor o igual a 0');
      setFieldError('physicalQuantity');
      return;
    }
    if (note.trim().length < 3) {
      setError('La nota debe tener al menos 3 caracteres');
      setFieldError('note');
      return;
    }

    setSubmitting(true);
    try {
      await setStock(referenceId, size, {
        physicalQuantity,
        note: note.trim(),
      });
      setNote('');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo ajustar el stock'));
      setFieldError(getFieldError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel-block" aria-labelledby="stock-title">
      <h3 id="stock-title">Ajuste de stock</h3>
      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="size">Talla</label>
        <input
          id="size"
          name="size"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          required
          aria-invalid={fieldError === 'size'}
        />

        <label htmlFor="physicalQuantity">Cantidad física</label>
        <input
          id="physicalQuantity"
          name="physicalQuantity"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          aria-invalid={fieldError === 'physicalQuantity'}
        />

        <label htmlFor="note">Nota</label>
        <textarea
          id="note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
          minLength={3}
          aria-invalid={fieldError === 'note'}
        />

        <ErrorMessage message={error} id="stock-error" />

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar stock'}
        </button>
      </form>
    </section>
  );
}
