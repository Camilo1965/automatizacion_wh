import {
  CustomerDetailResponseSchema,
  CustomerListResponseSchema,
  CustomerReconciliationResponseSchema,
  type CustomerSegment,
} from '@camila/contracts';

import { apiRequest } from './client';

export async function listCustomers(input: {
  segment?: CustomerSegment;
  query?: string;
  cursor?: string | null;
}) {
  const params = new URLSearchParams({ limit: '25' });
  if (input.segment !== undefined) params.set('segment', input.segment);
  if (input.query) params.set('query', input.query);
  if (input.cursor) params.set('cursor', input.cursor);
  return (
    await apiRequest(`/customers?${params}`, {
      schema: CustomerListResponseSchema,
    })
  ).data;
}

export async function getCustomer(id: string) {
  return (
    await apiRequest(`/customers/${encodeURIComponent(id)}`, {
      schema: CustomerDetailResponseSchema,
    })
  ).data;
}

export async function getCustomerReconciliation(
  input: {
    ordersCursor?: string | null;
    conversationsCursor?: string | null;
  } = {},
) {
  const params = new URLSearchParams({ limit: '25' });
  if (input.ordersCursor) params.set('ordersCursor', input.ordersCursor);
  if (input.conversationsCursor)
    params.set('conversationsCursor', input.conversationsCursor);
  return (
    await apiRequest(`/customers/reconciliation?${params}`, {
      schema: CustomerReconciliationResponseSchema,
    })
  ).data;
}
