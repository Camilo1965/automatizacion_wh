import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createOrder } from '../api/orders-api';
import { listReferences } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

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
    <section aria-labelledby="new-order-title">
      <h2 id="new-order-title">Nuevo pedido</h2>
      <form className="card" onSubmit={submit}>
        <label>
          Referencia
          <select
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
        </label>
        <label>
          Talla
          <select
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
        </label>
        <label>
          Cantidad
          <input
            min="1"
            max="10"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>
        {mutation.isError ? (
          <ErrorMessage
            message={getErrorMessage(
              mutation.error,
              'No se pudo crear el pedido',
            )}
          />
        ) : null}
        <button
          className="button-primary"
          disabled={mutation.isPending}
          type="submit"
        >
          Crear borrador
        </button>
      </form>
    </section>
  );
}
