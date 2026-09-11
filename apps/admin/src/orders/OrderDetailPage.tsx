import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import {
  confirmOrder,
  createOrderSummary,
  getOrder,
  orderAction,
  updateOrder,
  createShippingQuotes,
  downloadGuidePdf,
  getShipping,
  reviewUncertainGuide,
  selectShippingQuote,
} from '../api/orders-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { LocalityPicker } from '../components/LocalityPicker';
import type { LocalityPublic } from '@camila/contracts';
import { operationalLabel } from '../lib/operational-label';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
  });
  const shipping = useQuery({
    queryKey: ['shipping', orderId],
    queryFn: () => getShipping(orderId),
  });
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [locality, setLocality] = useState<string | null>(null);
  const [selectedLocality, setSelectedLocality] =
    useState<LocalityPublic | null>(null);
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['order', orderId] }),
      client.invalidateQueries({ queryKey: ['shipping', orderId] }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      updateOrder(orderId, {
        customerName: name ?? query.data?.customer.name ?? '',
        customerPhone: phone ?? query.data?.customer.phone ?? '',
        address: address ?? query.data?.destination.address ?? '',
        localityCarrierCode:
          locality ?? query.data?.destination.localityCarrierCode ?? '',
      }),
    onSuccess: refresh,
  });
  const summary = useMutation({
    mutationFn: () => createOrderSummary(orderId),
  });
  const quote = useMutation({
    mutationFn: () => createShippingQuotes(orderId),
    onSuccess: refresh,
  });
  const chooseQuote = useMutation({
    mutationFn: (quoteId: string) => selectShippingQuote(orderId, quoteId),
    onSuccess: refresh,
  });
  const pdf = useMutation({
    mutationFn: () => downloadGuidePdf(orderId),
    onSuccess: refresh,
  });
  const [reviewNumber, setReviewNumber] = useState('');
  const review = useMutation({
    mutationFn: () => reviewUncertainGuide(orderId, reviewNumber),
    onSuccess: refresh,
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
  const money = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  const selectedQuote = shipping.data?.quotes.find((item) => item.selected);
  return (
    <section aria-labelledby="order-title" className="order-detail">
      <header className="order-hero">
        <div>
          <p className="eyebrow">Pedido</p>
          <h2 id="order-title">{order.orderNumber}</h2>
          <p className="status-pill">{operationalLabel(order.status)}</p>
        </div>
        <strong>
          {order.quantity} {order.quantity === 1 ? 'par' : 'pares'}
        </strong>
      </header>
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
              value={name ?? order.customer.name ?? ''}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Teléfono
            <input
              required
              placeholder="3001234567"
              value={phone ?? order.customer.phone ?? ''}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label>
            Dirección
            <input
              required
              value={address ?? order.destination.address ?? ''}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <LocalityPicker
            value={selectedLocality}
            onChange={(value) => {
              setSelectedLocality(value);
              setLocality(value.carrierCode);
            }}
          />
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
          <h3>Envío</h3>
          <button
            className="button-secondary"
            onClick={() => quote.mutate()}
            disabled={quote.isPending}
          >
            Cotizar envío
          </button>
          {shipping.data?.quotes.map((item) => (
            <label key={item.id} className="shipping-option">
              <input
                type="radio"
                name="shipping-quote"
                checked={item.selected}
                onChange={() => chooseQuote.mutate(item.id)}
              />
              <strong>{item.carrier}</strong> · {money(item.totalShippingCop)}
              {' · '}
              {item.insuranceMode === 'none'
                ? 'Económico'
                : `Protegido · Seguro 99 ${item.insuranceMode === 'plus' ? 'Plus' : 'estándar'}`}
              {item.estimatedDays ? ` · ${item.estimatedDays} día(s)` : ''}
              {item.recommended ? ' · Recomendada' : ''}
            </label>
          ))}
          {selectedQuote ? (
            <p>
              Envío seleccionado: {selectedQuote.carrier} ·{' '}
              {money(selectedQuote.totalShippingCop)}
            </p>
          ) : (
            <p>Selecciona una cotización antes de confirmar.</p>
          )}
          <button
            className="button-secondary"
            onClick={() => summary.mutate()}
            disabled={summary.isPending || selectedQuote === undefined}
          >
            Generar resumen
          </button>
          {summary.data ? (
            <>
              <p>
                Total contra entrega:{' '}
                {money(summary.data.snapshot.totalCop as number)}
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
      {shipping.data?.guide ? (
        <div className="card">
          <h3>Guía de envío</h3>
          <p>
            Estado: {shipping.data.guide.status} · {shipping.data.guide.carrier}
          </p>
          {shipping.data.guide.preShipmentNumber ? (
            <p>Número: {shipping.data.guide.preShipmentNumber}</p>
          ) : null}
          {shipping.data.guide.status === 'created' ? (
            <button onClick={() => pdf.mutate()} disabled={pdf.isPending}>
              Descargar PDF
            </button>
          ) : null}
          {shipping.data.guide.status === 'uncertain' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                review.mutate();
              }}
            >
              <label>
                Número verificado en 99envíos
                <input
                  required
                  maxLength={64}
                  value={reviewNumber}
                  onChange={(event) => setReviewNumber(event.target.value)}
                />
              </label>
              <button disabled={review.isPending}>Registrar revisión</button>
            </form>
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
      {save.isError ||
      summary.isError ||
      action.isError ||
      confirm.isError ||
      quote.isError ||
      chooseQuote.isError ||
      pdf.isError ||
      review.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            save.error ??
              summary.error ??
              action.error ??
              confirm.error ??
              quote.error ??
              chooseQuote.error ??
              pdf.error ??
              review.error,
            'No se pudo actualizar el pedido',
          )}
        />
      ) : null}
    </section>
  );
}
