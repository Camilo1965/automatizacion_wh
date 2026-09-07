import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import {
  confirmOrder,
  createOrderSummary,
  getOrder,
  orderAction,
  updateOrder,
} from '../api/orders-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['order', orderId] });
  const save = useMutation({
    mutationFn: () =>
      updateOrder(orderId, {
        customerName: name,
        customerPhone: phone,
        address,
        localityCarrierCode: locality,
      }),
    onSuccess: refresh,
  });
  const summary = useMutation({
    mutationFn: () => createOrderSummary(orderId),
  });
  const action = useMutation({
    mutationFn: (value: 'cancel' | 'dispatch' | 'deliver' | 'return') =>
      orderAction(orderId, value),
    onSuccess: refresh,
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (summary.data === undefined)
        throw new Error('Primero genera el resumen');
      return confirmOrder(orderId, summary.data.version);
    },
    onSuccess: refresh,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }
  if (query.isLoading) return <LoadingState label="Cargando pedido…" />;
  if (query.isError || query.data === undefined)
    return (
      <ErrorMessage
        message={getErrorMessage(query.error, 'No se pudo cargar el pedido')}
      />
    );
  const order = query.data;
  return (
    <section aria-labelledby="order-title">
      <h2 id="order-title">
        {order.orderNumber} · {order.status}
      </h2>
      <p>
        {order.reference.code} · {order.reference.modelName} · talla{' '}
        {order.size} · {order.quantity} par(es)
      </p>
      {order.status === 'draft' ? (
        <form className="card" onSubmit={submit}>
          <h3>Cliente y destino</h3>
          <label>
            Nombre
            <input
              required
              defaultValue={order.customer.name ?? ''}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Teléfono
            <input
              required
              placeholder="3001234567"
              defaultValue={order.customer.phone ?? ''}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label>
            Dirección
            <input
              required
              defaultValue={order.destination.address ?? ''}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <label>
            Código de localidad
            <input
              required
              defaultValue={order.destination.localityCarrierCode ?? ''}
              onChange={(event) => setLocality(event.target.value)}
            />
          </label>
          <button className="button-primary" disabled={save.isPending}>
            Guardar borrador
          </button>
        </form>
      ) : (
        <div className="card">
          <p>
            {order.customer.name} · {order.customer.phone}
          </p>
          <p>
            {order.destination.address} ·{' '}
            {order.destination.localityName ??
              order.destination.localityCarrierCode}
          </p>
        </div>
      )}
      {order.status === 'draft' ? (
        <div className="card">
          <button
            className="button-secondary"
            onClick={() => summary.mutate()}
            disabled={summary.isPending}
          >
            Generar resumen
          </button>
          {summary.data ? (
            <>
              <p>
                Total: ${summary.data.snapshot.totalCop as number} COP · envío
                pendiente
              </p>
              <button
                className="button-primary"
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending}
              >
                Confirmar y reservar
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="card">
        {order.status === 'draft' || order.status === 'confirmed' ? (
          <button onClick={() => action.mutate('cancel')}>Cancelar</button>
        ) : null}
        {order.status === 'confirmed' ? (
          <button onClick={() => action.mutate('dispatch')}>Despachar</button>
        ) : null}
        {order.status === 'dispatched' ? (
          <button onClick={() => action.mutate('deliver')}>Entregar</button>
        ) : null}
        {order.status === 'delivered' || order.status === 'dispatched' ? (
          <button onClick={() => action.mutate('return')}>
            Registrar devolución
          </button>
        ) : null}
      </div>
      {save.isError || summary.isError || action.isError || confirm.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            save.error ?? summary.error ?? action.error ?? confirm.error,
            'No se pudo actualizar el pedido',
          )}
        />
      ) : null}
    </section>
  );
}
