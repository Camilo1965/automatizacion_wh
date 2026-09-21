import { useState, type FormEvent } from 'react';

import { setStock, type StockAvailability } from '../api/catalog-api';
import { getErrorMessage, getFieldError } from '../api/client';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageSection } from '../components/PageHeader';
import { parseIntegerDigits } from '../lib/parse-integer-digits';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
    <PageSection aria-labelledby="stock-title" className="space-y-4">
      <h3
        id="stock-title"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        Ajuste de stock
      </h3>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="size">Talla</Label>
          <Input
            id="size"
            name="size"
            value={size}
            onChange={(event) => setSize(event.target.value)}
            required
            disabled={submitting}
            aria-invalid={fieldError === 'size'}
            className="h-11 rounded-[1.125rem] bg-muted"
          />
        </div>

        <p
          className="rounded-[1.125rem] border border-border bg-muted px-3 py-2 text-sm text-foreground"
          role="status"
        >
          Físico: {current.physicalQuantity} · Reservado:{' '}
          {current.reservedQuantity} · Disponible: {current.availableQuantity}
        </p>

        <div className="space-y-2">
          <Label htmlFor="physicalQuantity">Cantidad física</Label>
          <Input
            id="physicalQuantity"
            name="physicalQuantity"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            disabled={submitting}
            aria-invalid={fieldError === 'physicalQuantity'}
            className="h-11 rounded-[1.125rem] bg-muted"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Nota</Label>
          <Textarea
            id="note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            minLength={3}
            disabled={submitting}
            aria-invalid={fieldError === 'note'}
            className="min-h-24 rounded-[1.125rem] bg-muted"
          />
        </div>

        <ErrorMessage message={error} id="stock-error" />

        <Button type="submit" className="h-11" loading={submitting}>
          {submitting ? 'Guardando…' : 'Guardar stock'}
        </Button>
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
    </PageSection>
  );
}
