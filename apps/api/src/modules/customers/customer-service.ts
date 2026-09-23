import { z } from 'zod';

import {
  CustomerDetailSchema,
  CustomerListResponseSchema,
  CustomerReconciliationSchema,
  type CustomerDetail,
  type CustomerReconciliation,
  type CustomerSegment,
  type CustomerSummary,
} from '@camila/contracts';

import type {
  CustomerCursor,
  CustomerRepository,
} from './postgres-customer-repository.js';

const cursorSchema = z
  .object({
    createdAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
    id: z.uuid(),
  })
  .strict();

function decodeCursor(value: string): CustomerCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new z.ZodError([
      { code: 'custom', path: ['cursor'], message: 'Invalid cursor' },
    ]);
  }
  return cursorSchema.parse(parsed);
}

function toSummary(value: {
  id: string;
  displayName: string | null;
  normalizedPhone: string;
  segment: CustomerSegment;
  marketingConsent: 'unknown' | 'granted' | 'denied' | 'revoked';
  lastActivityAt: Date;
  createdAt: Date;
}): CustomerSummary {
  return {
    id: value.id,
    displayName: value.displayName,
    normalizedPhone: value.normalizedPhone,
    segment: value.segment,
    marketingConsent: value.marketingConsent,
    lastActivityAt: value.lastActivityAt.toISOString(),
    createdAt: value.createdAt.toISOString(),
  };
}

export class CustomerService {
  constructor(private readonly repository: CustomerRepository) {}

  async list(input: {
    segment?: CustomerSegment;
    query?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: CustomerSummary[]; nextCursor: string | null }> {
    const page = await this.repository.list({
      limit: input.limit,
      ...(input.segment === undefined ? {} : { segment: input.segment }),
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.cursor === undefined
        ? {}
        : { after: decodeCursor(input.cursor) }),
    });
    const result = {
      items: page.items.map(toSummary),
      nextCursor:
        page.nextCursor === null
          ? null
          : Buffer.from(JSON.stringify(page.nextCursor), 'utf8').toString(
              'base64url',
            ),
    };
    return CustomerListResponseSchema.parse({ data: result }).data;
  }

  async get(id: string): Promise<CustomerDetail | null> {
    const detail = await this.repository.get(id);
    if (detail === null) return null;
    return CustomerDetailSchema.parse({
      ...toSummary(detail),
      orders: detail.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
      })),
      conversations: detail.conversations.map((conversation) => ({
        id: conversation.id,
        customerPhone: conversation.customerPhone,
        state: conversation.state,
        updatedAt: conversation.updatedAt.toISOString(),
      })),
    });
  }

  async reconciliation(limit: number): Promise<CustomerReconciliation> {
    const queue = await this.repository.reconciliation(limit);
    return CustomerReconciliationSchema.parse({
      orders: queue.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        href: order.href,
      })),
      conversations: queue.conversations.map((conversation) => ({
        id: conversation.id,
        customerPhone: conversation.customerPhone,
        state: conversation.state,
        createdAt: conversation.createdAt.toISOString(),
        href: conversation.href,
      })),
    });
  }
}
