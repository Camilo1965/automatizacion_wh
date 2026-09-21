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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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
    <section aria-labelledby="order-title" className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Pedido
          </p>
          <h2
            id="order-title"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            {order.orderNumber}
          </h2>
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
        <strong className="text-lg font-semibold text-foreground">
          {order.quantity} {order.quantity === 1 ? 'par' : 'pares'}
        </strong>
      </header>
      <p className="text-sm text-muted-foreground">
        {order.reference.code} · {order.reference.modelName} ·{' '}
        {order.reference.color} · talla {order.size}
      </p>
      {order.status === 'draft' ? (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Cliente y destino
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="order-customer-name">Nombre</Label>
                <Input
                  id="order-customer-name"
                  className="h-11 rounded-[1.125rem] bg-muted"
                  required
                  value={name ?? order.customer.name ?? ''}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-customer-phone">Teléfono</Label>
                <Input
                  id="order-customer-phone"
                  className="h-11 rounded-[1.125rem] bg-muted"
                  required
                  placeholder="3001234567"
                  value={phone ?? order.customer.phone ?? ''}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-customer-address">Dirección</Label>
                <Input
                  id="order-customer-address"
                  className="h-11 rounded-[1.125rem] bg-muted"
                  required
                  value={address ?? order.destination.address ?? ''}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>
              <LocalityPicker
                value={pickerLocality}
                onChange={(value) => {
                  setLocalityEdited(true);
                  setSelectedLocality(value);
                  setLocality(value?.carrierCode ?? '');
                }}
              />
              <Button
                loading={save.isPending}
                disabled={pickerLocality === null}
                type="submit"
              >
                Guardar borrador
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardContent className="space-y-1 pt-(--card-spacing)">
            <p className="text-sm text-foreground">
              {order.customer.name} · {order.customer.phone}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.destination.address} ·{' '}
              {order.destination.localityName ??
                order.destination.localityCarrierCode}
            </p>
          </CardContent>
        </Card>
      )}
      {order.status === 'draft' ? (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Envío</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="secondary"
              onClick={() => quote.mutate()}
              loading={quote.isPending}
              type="button"
            >
              Cotizar envío
            </Button>
            <div className="space-y-2">
              {shipping.data?.quotes.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded-[1.125rem] border border-border bg-muted/40 px-3 py-3 text-sm"
                >
                  <input
                    type="radio"
                    name="shipping-quote"
                    className="mt-1"
                    checked={item.selected}
                    onChange={() => chooseQuote.mutate(item.id)}
                  />
                  <span>
                    <strong>{item.carrier}</strong> ·{' '}
                    {money(item.totalShippingCop)}
                    {' · '}
                    {item.insuranceMode === 'none'
                      ? 'Económico'
                      : `Protegido · Seguro 99 ${item.insuranceMode === 'plus' ? 'Plus' : 'estándar'}`}
                    {item.estimatedDays ? ` · ${item.estimatedDays} día(s)` : ''}
                    {item.recommended ? ' · Recomendada' : ''}
                  </span>
                </label>
              ))}
            </div>
            {selectedQuote ? (
              <p className="text-sm text-foreground">
                Envío seleccionado: {selectedQuote.carrier} ·{' '}
                {money(selectedQuote.totalShippingCop)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una cotización antes de confirmar.
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => summary.mutate()}
              loading={summary.isPending}
              disabled={selectedQuote === undefined}
              type="button"
            >
              Generar resumen
            </Button>
            {summary.data ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Total contra entrega:{' '}
                  {money(summary.data.snapshot.totalCop as number)}
                </p>
                <Button
                  onClick={() => confirm.mutate()}
                  loading={confirm.isPending}
                  type="button"
                >
                  Confirmar y reservar
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {shipping.data?.guide ? (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Guía de envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">
              Estado: {shipping.data.guide.status} ·{' '}
              {shipping.data.guide.carrier}
            </p>
            {shipping.data.guide.preShipmentNumber ? (
              <p className="text-sm text-muted-foreground">
                Número: {shipping.data.guide.preShipmentNumber}
              </p>
            ) : null}
            {shipping.data.guide.status === 'created' ? (
              <Button
                variant="secondary"
                onClick={() => pdf.mutate()}
                loading={pdf.isPending}
                type="button"
              >
                Descargar PDF
              </Button>
            ) : null}
            {shipping.data.guide.status === 'uncertain' ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  review.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="guide-review-number">
                    Número verificado en 99envíos
                  </Label>
                  <Input
                    id="guide-review-number"
                    className="h-11 rounded-[1.125rem] bg-muted"
                    required
                    maxLength={64}
                    value={reviewNumber}
                    onChange={(event) => setReviewNumber(event.target.value)}
                  />
                </div>
                <Button loading={review.isPending} type="submit">
                  Registrar revisión
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card
        className="rounded-3xl border-border shadow-[var(--shadow-card)]"
        aria-label="Acciones del pedido"
      >
        <CardContent className="space-y-3 pt-(--card-spacing)">
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
            <p className="text-sm text-muted-foreground" role="status">
              Despacho bloqueado: la guía aún no está creada. Revisa el estado o
              espera la creación automática.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {order.status === 'draft' || order.status === 'confirmed' ? (
              <Button
                variant="danger"
                onClick={() => setPendingAction('cancel')}
              >
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
        </CardContent>
      </Card>
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
