import { useState, type FormEvent } from 'react';

import { setStock, type StockAvailability } from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { parseIntegerDigits } from '../lib/parse-integer-digits';

const MAX_QUANTITY = 2_000_000_000;

type StockEditorProps = {
  referenceId: string;
  stock: StockAvailability[];
  onSaved: () => void;
};

export function StockEditor({ referenceId, stock, onSaved }: StockEditorProps) {
  const [size, setSize] = useState('37');
  const [quantity, setQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);

  const found = stock.find((item) => item.size === size);
  const current = found ?? {
    physicalQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFieldError(undefined);

    const physicalQuantity = parseIntegerDigits(quantity, {
      min: 0,
      max: MAX_QUANTITY,
    });
    if (physicalQuantity === null) {
      setError('La cantidad debe ser un entero mayor o igual a 0');
      setFieldError('physicalQuantity');
      return;
    }
    if (physicalQuantity < current.reservedQuantity) {
      setError(
        `La cantidad física no puede ser inferior a la reservada (${current.reservedQuantity})`,
      );
      setFieldError('physicalQuantity');
      return;
    }
    if (note.trim().length < 3) {
      setError('La nota debe tener al menos 3 caracteres');
      setFieldError('note');
      return;
    }

    setPendingQuantity(physicalQuantity);
    setConfirmOpen(true);
  }

  async function confirmSave() {
    if (pendingQuantity === null) {
      return;
    }
    setSubmitting(true);
    setError('');
    setFieldError(undefined);
    try {
      await setStock(referenceId, size, {
        physicalQuantity: pendingQuantity,
        note: note.trim(),
      });
      setNote('');
      setConfirmOpen(false);
      setPendingQuantity(null);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo ajustar el stock'));
      setFieldError(getFieldError(err));
      setConfirmOpen(false);
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
          disabled={submitting}
          aria-invalid={fieldError === 'size'}
        />

        <p className="stock-balance" role="status">
          Físico: {current.physicalQuantity} · Reservado:{' '}
          {current.reservedQuantity} · Disponible: {current.availableQuantity}
        </p>

        <label htmlFor="physicalQuantity">Cantidad física</label>
        <input
          id="physicalQuantity"
          name="physicalQuantity"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          disabled={submitting}
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
          disabled={submitting}
          aria-invalid={fieldError === 'note'}
        />

        <ErrorMessage message={error} id="stock-error" />

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar stock'}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar ajuste de stock"
        message={`Talla ${size}: cantidad anterior ${current.physicalQuantity} → nueva ${pendingQuantity ?? quantity}. Motivo: ${note.trim()}`}
        confirmLabel="Confirmar"
        onConfirm={() => {
          void confirmSave();
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingQuantity(null);
        }}
        busy={submitting}
      />
    </section>
  );
}
