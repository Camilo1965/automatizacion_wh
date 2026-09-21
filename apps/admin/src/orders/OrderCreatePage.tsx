import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createOrder } from '../api/orders-api';
import { listReferences } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader } from '../components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const selectClassName =
  'control-target h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

export function OrderCreatePage() {
  const navigate = useNavigate();
  const references = useQuery({
    queryKey: ['references', 'order-create'],
    queryFn: () => listReferences({ status: 'active', limit: 100 }),
  });
  const [referenceId, setReferenceId] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('1');
  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => {
      void navigate(`/orders/${order.id}`);
    },
  });
  const selected = references.data?.items.find(
    (reference) => reference.id === referenceId,
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ referenceId, size, quantity: Number(quantity) });
  }
  return (
    <section aria-labelledby="new-order-title" className="space-y-6">
      <PageHeader title="Nuevo pedido" titleId="new-order-title" />
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Borrador</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="order-reference">Referencia</Label>
              <select
                id="order-reference"
                className={selectClassName}
                value={referenceId}
                onChange={(event) => {
                  setReferenceId(event.target.value);
                  setSize('');
                }}
                required
              >
                <option value="">Selecciona una referencia</option>
                {references.data?.items.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.code} — {reference.modelName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-size">Talla</Label>
              <select
                id="order-size"
                className={selectClassName}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                required
                disabled={selected === undefined}
              >
                <option value="">Selecciona una talla</option>
                {selected?.availableSizes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-quantity">Cantidad</Label>
              <Input
                id="order-quantity"
                className="h-11 rounded-[1.125rem] bg-muted"
                min={1}
                max={10}
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </div>
            {mutation.isError ? (
              <ErrorMessage
                message={getErrorMessage(
                  mutation.error,
                  'No se pudo crear el pedido',
                )}
              />
            ) : null}
            <Button loading={mutation.isPending} type="submit">
              Crear borrador
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
