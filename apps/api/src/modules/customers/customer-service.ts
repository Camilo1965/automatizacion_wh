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

const cursorTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

function isRealUtcTimestamp(value: string): boolean {
  const parts = cursorTimestampPattern.exec(value);
  if (parts === null) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const milliseconds = Number(parts[7]?.slice(0, 3));
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === milliseconds
  );
}

const cursorSchema = z
  .object({
    createdAt: z
      .string()
      .refine(isRealUtcTimestamp, 'Cursor timestamp must be a real UTC date'),
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

function encodeCursor(value: CustomerCursor | null): string | null {
  return value === null
    ? null
    : Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
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
      nextCursor: encodeCursor(page.nextCursor),
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

  async reconciliation(input: {
    limit: number;
    kind?: 'all' | 'orders' | 'conversations';
    ordersCursor?: string;
    conversationsCursor?: string;
  }): Promise<CustomerReconciliation> {
    const kind = input.kind ?? 'all';
    const queue = await this.repository.reconciliation({
      limit: input.limit,
      kind,
      ...(input.ordersCursor === undefined
        ? {}
        : { ordersAfter: decodeCursor(input.ordersCursor) }),
      ...(input.conversationsCursor === undefined
        ? {}
        : { conversationsAfter: decodeCursor(input.conversationsCursor) }),
    });
    return CustomerReconciliationSchema.parse({
      orders: (kind === 'conversations' ? [] : queue.orders).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        href: order.href,
      })),
      conversations: (kind === 'orders' ? [] : queue.conversations).map(
        (conversation) => ({
          id: conversation.id,
          customerPhone: conversation.customerPhone,
          state: conversation.state,
          createdAt: conversation.createdAt.toISOString(),
          href: conversation.href,
        }),
      ),
      ordersNextCursor:
        kind === 'conversations' ? null : encodeCursor(queue.ordersNextCursor),
      conversationsNextCursor:
        kind === 'orders' ? null : encodeCursor(queue.conversationsNextCursor),
    });
  }
}
