import {
  ListOrdersResponseSchema,
  OrderResponseSchema,
  OrderSummaryResponseSchema,
  ShippingResponseSchema,
  type CreateOrderBody,
  type OrderPublic,
  type OrderSummaryPublic,
  type PatchOrderBody,
  type ShippingResponse,
} from '@camila/contracts';

import { apiDownload, apiRequest, apiRequestNoContent } from './client';

export type { OrderPublic, OrderSummaryPublic };

export async function listOrders(): Promise<readonly OrderPublic[]> {
  return (await apiRequest('/orders', { schema: ListOrdersResponseSchema }))
    .data.items;
}
export async function createOrder(body: CreateOrderBody): Promise<OrderPublic> {
  return (
    await apiRequest('/orders', {
      method: 'POST',
      body,
      schema: OrderResponseSchema,
    })
  ).data;
}
export async function getOrder(orderId: string): Promise<OrderPublic> {
  return (
    await apiRequest(`/orders/${orderId}`, { schema: OrderResponseSchema })
  ).data;
}
export async function updateOrder(
  orderId: string,
  body: PatchOrderBody,
): Promise<OrderPublic> {
  return (
    await apiRequest(`/orders/${orderId}`, {
      method: 'PATCH',
      body,
      schema: OrderResponseSchema,
    })
  ).data;
}
export async function createOrderSummary(
  orderId: string,
): Promise<OrderSummaryPublic> {
  return (
    await apiRequest(`/orders/${orderId}/summaries`, {
      method: 'POST',
      schema: OrderSummaryResponseSchema,
    })
  ).data;
}
export async function orderAction(
  orderId: string,
  action: 'cancel' | 'dispatch' | 'deliver' | 'return',
): Promise<OrderPublic> {
  return (
    await apiRequest(`/orders/${orderId}/${action}`, {
      method: 'POST',
      schema: OrderResponseSchema,
    })
  ).data;
}
export async function confirmOrder(
  orderId: string,
  summaryVersion: number,
): Promise<OrderPublic> {
  return (
    await apiRequest(`/orders/${orderId}/confirm`, {
      method: 'POST',
      body: { summaryVersion, idempotencyKey: crypto.randomUUID() },
      schema: OrderResponseSchema,
    })
  ).data;
}

export type ShippingState = ShippingResponse['data'];

export async function getShipping(orderId: string): Promise<ShippingState> {
  return (
    await apiRequest(`/orders/${orderId}/shipping`, {
      schema: ShippingResponseSchema,
    })
  ).data;
}

export async function createShippingQuotes(
  orderId: string,
): Promise<ShippingState> {
  return (
    await apiRequest(`/orders/${orderId}/shipping-quotes`, {
      method: 'POST',
      schema: ShippingResponseSchema,
    })
  ).data;
}

export async function selectShippingQuote(
  orderId: string,
  quoteId: string,
): Promise<ShippingState> {
  return (
    await apiRequest(`/orders/${orderId}/shipping-quotes/${quoteId}/select`, {
      method: 'POST',
      schema: ShippingResponseSchema,
    })
  ).data;
}

export async function reviewUncertainGuide(
  orderId: string,
  preShipmentNumber: string,
): Promise<void> {
  return apiRequestNoContent(`/orders/${orderId}/shipping-guide/review`, {
    method: 'POST',
    body: { preShipmentNumber },
  });
}

export async function downloadGuidePdf(orderId: string): Promise<void> {
  const blob = await apiDownload(`/orders/${orderId}/shipping-guide/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `guia-${orderId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
