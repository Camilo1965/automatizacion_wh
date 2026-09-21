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
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { LocalityPicker } from '../components/LocalityPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import type { LocalityPublic } from '@camila/contracts';
import { operationalLabel } from '../lib/operational-label';

type OrderLifecycleAction = 'cancel' | 'dispatch' | 'deliver' | 'return';

const actionCopy: Record<
  OrderLifecycleAction,
  { title: string; message: string; confirmLabel: string }
> = {
  cancel: {
    title: 'Cancelar pedido',
    message:
      'Se liberará la reserva. Si la guía ya fue creada, quedará pendiente de conciliación externa.',
    confirmLabel: 'Cancelar pedido',
  },
  dispatch: {
    title: 'Despachar pedido',
    message:
      'Se descontará el inventario físico y se marcará el pedido como despachado.',
    confirmLabel: 'Despachar',
  },
  deliver: {
    title: 'Marcar como entregado',
    message: 'El pedido quedará cerrado como entregado.',
    confirmLabel: 'Marcar entregado',
  },
  return: {
    title: 'Registrar devolución',
    message:
      'Se devolverá la unidad al inventario físico si el pedido ya había sido despachado.',
    confirmLabel: 'Registrar devolución',
  },
};

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
  const [localityEdited, setLocalityEdited] = useState(false);
  const pickerLocality =
    !localityEdited && query.data?.destination.localityCarrierCode
      ? {
          carrierCode: query.data.destination.localityCarrierCode,
          department: query.data.destination.localityDepartment ?? 'Colombia',
          locality: query.data.destination.localityName ?? 'Municipio guardado',
          country: 'CO' as const,
          normalizedName:
            `${query.data.destination.localityName ?? ''} ${query.data.destination.localityDepartment ?? ''}`.trim(),
        }
      : selectedLocality;
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
  const [pendingAction, setPendingAction] =
    useState<OrderLifecycleAction | null>(null);
  const review = useMutation({
    mutationFn: () => reviewUncertainGuide(orderId, reviewNumber),
    onSuccess: refresh,
  });
  const action = useMutation({
    mutationFn: (value: OrderLifecycleAction) => orderAction(orderId, value),
    onSuccess: async () => {
      setPendingAction(null);
      await refresh();
    },
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
  const guide = shipping.data?.guide;
  const canDispatch = guide?.status === 'created';
  const pendingActionCopy =
    pendingAction === null ? null : actionCopy[pendingAction];
  const primaryAction: OrderLifecycleAction | null =
    order.status === 'confirmed'
      ? 'dispatch'
      : order.status === 'dispatched'
        ? 'deliver'
        : null;

  return (
    <section aria-labelledby="order-title" className="order-detail">
      <header className="order-hero">
        <div>
          <p className="eyebrow">Pedido</p>
          <h2 id="order-title">{order.orderNumber}</h2>
          <StatusBadge
            tone={
              order.status === 'confirmed' || order.status === 'dispatched'
                ? 'success'
                : order.status === 'cancelled'
                  ? 'danger'
                  : 'warning'
            }
          >
            {operationalLabel(order.status)}
          </StatusBadge>
        </div>
        <strong className="order-hero-qty">
          {order.quantity} {order.quantity === 1 ? 'par' : 'pares'}
        </strong>
      </header>
      <p className="order-product-line">
        {order.reference.code} · {order.reference.modelName} ·{' '}
        {order.reference.color} · talla {order.size}
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
            value={pickerLocality}
            onChange={(value) => {
              setLocalityEdited(true);
              setSelectedLocality(value);
              setLocality(value?.carrierCode ?? '');
            }}
          />
          <button
            className="button-primary"
            disabled={save.isPending || pickerLocality === null}
          >
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
      <div className="order-actions card" aria-label="Acciones del pedido">
        {primaryAction !== null ? (
          <Button
            onClick={() => setPendingAction(primaryAction)}
            disabled={primaryAction === 'dispatch' && !canDispatch}
            title={
              primaryAction === 'dispatch' && !canDispatch
                ? 'Primero debe existir una guía creada para despachar'
                : undefined
            }
          >
            {primaryAction === 'dispatch' ? 'Despachar' : 'Entregar'}
          </Button>
        ) : null}
        {order.status === 'confirmed' && !canDispatch ? (
          <p className="muted order-block-reason" role="status">
            Despacho bloqueado: la guía aún no está creada. Revisa el estado o
            espera la creación automática.
          </p>
        ) : null}
        <div className="order-actions-secondary">
          {order.status === 'draft' || order.status === 'confirmed' ? (
            <Button variant="danger" onClick={() => setPendingAction('cancel')}>
              Cancelar
            </Button>
          ) : null}
          {order.status === 'delivered' || order.status === 'dispatched' ? (
            <Button
              variant="secondary"
              onClick={() => setPendingAction('return')}
            >
              Registrar devolución
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={pendingActionCopy !== null}
        title={pendingActionCopy?.title ?? ''}
        message={pendingActionCopy?.message ?? ''}
        confirmLabel={pendingActionCopy?.confirmLabel ?? 'Confirmar'}
        busy={action.isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction !== null) action.mutate(pendingAction);
        }}
      />
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
