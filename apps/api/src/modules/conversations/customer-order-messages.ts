import type { OrderSummary } from '../orders/order-types.js';
import { renderFlowMessage } from './configured-flow.js';
import type { BotFlowDefinition } from './flow-definition.js';

type ReviewSnapshot = Readonly<{
  orderNumber?: string;
  reference?: Readonly<{ code?: string; modelName?: string; color?: string }>;
  size?: string;
  productSubtotalCop?: number;
  shippingCostCop?: number | null;
  shippingPending?: boolean;
  totalCop?: number;
  shippingQuote?: Readonly<{
    carrier?: string;
    insuranceMode?: 'none' | 'standard' | 'plus';
  }>;
  customer?: Readonly<{ name?: string }>;
  destination?: Readonly<{
    address?: string;
    locality?: string;
    department?: string;
  }>;
}>;

function formatCop(value: number): string {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(value)} COP`;
}

function reviewSnapshot(summary: OrderSummary): ReviewSnapshot {
  return summary.snapshot as ReviewSnapshot;
}

const currencyAmount =
  /(?:\b(?:COP|USD)\s*\$?\s*\d[\d.,]*|\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:COP|USD)\b)/i;

function containsConfiguredPrice(text: string): boolean {
  if (currencyAmount.test(text)) return true;
  const unaccented = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(?:precio|oferta|promo(?:cion)?|valor|cuesta|vale|por)(?:\s+(?:sugerido|de))?\s*:?\s*(?:\d{4,}|\d{1,3}(?:[.,]\d{3})+)\b/i.test(
    unaccented,
  );
}

export function hasQuotedShipping(summary: OrderSummary): boolean {
  const snapshot = reviewSnapshot(summary);
  return (
    snapshot.shippingPending !== true &&
    snapshot.shippingQuote != null &&
    typeof snapshot.shippingCostCop === 'number' &&
    Number.isFinite(snapshot.shippingCostCop) &&
    typeof snapshot.totalCop === 'number' &&
    Number.isFinite(snapshot.totalCop)
  );
}

function heading(
  snapshot: ReviewSnapshot,
  quoted: boolean,
  flow?: BotFlowDefinition,
): string {
  if (!flow) return '';
  const showCarrier = flow.optionalSteps.showCarrierInSummary !== false;
  const variables = {
    pedido: snapshot.orderNumber ?? '',
    referencia: snapshot.reference?.code ?? '',
    talla: snapshot.size ?? '',
    nombre: snapshot.customer?.name ?? '',
    total: quoted ? formatCop(snapshot.totalCop!) : '',
    transportadora: showCarrier ? (snapshot.shippingQuote?.carrier ?? '') : '',
  };
  const safeHeader = flow.steps.summary.message
    .split('\n')
    .filter(
      (line) =>
        !/(?:\btotal\b|\bresponde\b|\bconfirmar\b|\bcancelar\b)/i.test(line) &&
        !containsConfiguredPrice(line) &&
        (showCarrier || !/\{\{\s*transportadora\s*\}\}/i.test(line)),
    )
    .join('\n');
  return renderFlowMessage(safeHeader, variables).trim();
}

function confirmationQuestion(
  snapshot: ReviewSnapshot,
  flow?: BotFlowDefinition,
): string {
  const configured = flow?.steps.confirmation.message.trim() ?? '';
  const showCarrier = flow?.optionalSteps.showCarrierInSummary !== false;
  if (
    !configured.startsWith('¿') ||
    !configured.endsWith('?') ||
    configured.match(/\?/g)?.length !== 1 ||
    /\b(?:responde|escribe|cancelar|cambiar|total)\b|\{\{\s*total\s*\}\}/i.test(
      configured,
    ) ||
    containsConfiguredPrice(configured) ||
    (!showCarrier && /\{\{\s*transportadora\s*\}\}/i.test(configured))
  )
    return '¿Confirmas tu pedido para reservarlo?';
  return renderFlowMessage(configured, {
    pedido: snapshot.orderNumber ?? '',
    referencia: snapshot.reference?.code ?? '',
    talla: snapshot.size ?? '',
    nombre: snapshot.customer?.name ?? '',
    total: '',
    transportadora: showCarrier ? (snapshot.shippingQuote?.carrier ?? '') : '',
  });
}

export function formatOrderReview(
  summary: OrderSummary,
  flow?: BotFlowDefinition,
): string {
  const snapshot = reviewSnapshot(summary);
  const quoted = hasQuotedShipping(summary);
  const reference = [
    snapshot.reference?.code ? `REF ${snapshot.reference.code}` : '',
    snapshot.reference?.modelName ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  const model = snapshot.reference?.color
    ? `${reference} (${snapshot.reference.color})`
    : reference;
  const destination = [
    snapshot.destination?.locality,
    snapshot.destination?.department,
  ]
    .filter(Boolean)
    .join(', ');
  const carrier =
    flow?.optionalSteps.showCarrierInSummary === false
      ? ''
      : snapshot.shippingQuote?.carrier;
  const shippingLabel = carrier ? `Envío (${carrier})` : 'Envío';
  const details = [
    snapshot.orderNumber ? `Pedido ${snapshot.orderNumber}` : '',
    model,
    snapshot.size
      ? `Talla ${snapshot.size.endsWith('.0') ? snapshot.size.slice(0, -2) : snapshot.size}`
      : '',
    snapshot.productSubtotalCop == null
      ? ''
      : `Productos: ${formatCop(snapshot.productSubtotalCop)}`,
    quoted
      ? `${shippingLabel}: ${formatCop(snapshot.shippingCostCop!)}`
      : 'Envío pendiente de cotización',
    quoted ? `Total contra entrega: ${formatCop(snapshot.totalCop!)}` : '',
    quoted &&
    snapshot.shippingQuote?.insuranceMode !== 'none' &&
    snapshot.shippingQuote?.insuranceMode
      ? `Seguro ${snapshot.shippingQuote.insuranceMode === 'plus' ? '99 Plus' : '99 estándar'}`
      : '',
    snapshot.customer?.name ? `Cliente: ${snapshot.customer.name}` : '',
    snapshot.destination?.address
      ? `Dirección: ${snapshot.destination.address}`
      : '',
    destination,
  ].filter(Boolean);
  const closing = quoted
    ? [
        confirmationQuestion(snapshot, flow),
        `• ${flow?.commands.confirm ?? 'confirmar'}`,
        `• ${flow?.commands.cancel ?? 'cancelar'}`,
        `• ${flow?.commands.editAddress ?? 'cambiar dirección'}`,
        `• ${flow?.commands.editLocality ?? 'cambiar municipio'}`,
        `• ${flow?.commands.editProduct ?? 'cambiar producto'}`,
      ]
    : ['La propietaria revisará la cobertura y te avisará.'];
  return [
    heading(snapshot, quoted, flow),
    details.join('\n'),
    closing.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}
