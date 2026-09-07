import {
  ListOrdersResponseSchema,
  OrderResponseSchema,
  OrderSummaryResponseSchema,
  type CreateOrderBody,
  type OrderPublic,
  type OrderSummaryPublic,
  type PatchOrderBody,
} from '@camila/contracts';

import { apiRequest } from './client';

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
