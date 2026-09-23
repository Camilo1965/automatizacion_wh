import { and, desc, eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  customers,
  salesOrders,
  whatsappConversations,
} from '../../database/schema/index.js';

export type CustomerSegment = 'buyer' | 'not_yet_buyer' | 'needs_review';
export type CustomerCursor = Readonly<{ createdAt: string; id: string }>;
export type CustomerSummary = Readonly<{
  id: string;
  displayName: string | null;
  normalizedPhone: string;
  segment: CustomerSegment;
  marketingConsent: 'unknown' | 'granted' | 'denied' | 'revoked';
  lastActivityAt: Date;
  createdAt: Date;
}>;
export type CustomerDetail = CustomerSummary &
  Readonly<{
    orders: readonly Readonly<{
      id: string;
      orderNumber: string;
      status: string;
      createdAt: Date;
    }>[];
    conversations: readonly Readonly<{
      id: string;
      customerPhone: string;
      state: string;
      updatedAt: Date;
    }>[];
  }>;
export type CustomerReconciliation = Readonly<{
  orders: readonly Readonly<{
    id: string;
    orderNumber: string;
    customerName: string | null;
    customerPhone: string | null;
    status: string;
    createdAt: Date;
    href: string;
  }>[];
  conversations: readonly Readonly<{
    id: string;
    customerPhone: string;
    state: string;
    createdAt: Date;
    href: string;
  }>[];
}>;

export interface CustomerRepository {
  list(input: {
    segment?: CustomerSegment;
    query?: string;
    limit: number;
    after?: CustomerCursor;
  }): Promise<{
    items: readonly CustomerSummary[];
    nextCursor: CustomerCursor | null;
  }>;
  get(id: string): Promise<CustomerDetail | null>;
  reconciliation(limit: number): Promise<CustomerReconciliation>;
}

const segmentSql = sql<CustomerSegment>`CASE
  WHEN ${customers.needsReview} THEN 'needs_review'
  WHEN EXISTS (
    SELECT 1 FROM sales_orders AS delivered_order
    WHERE delivered_order.customer_id = ${customers.id}
      AND delivered_order.status = 'delivered'
  ) THEN 'buyer'
  ELSE 'not_yet_buyer'
END`;

const lastActivitySql = sql<Date>`GREATEST(
  ${customers.updatedAt},
  COALESCE((SELECT MAX(o.updated_at) FROM sales_orders AS o WHERE o.customer_id = ${customers.id}), ${customers.updatedAt}),
  COALESCE((SELECT MAX(c.updated_at) FROM whatsapp_conversations AS c WHERE c.customer_id = ${customers.id}), ${customers.updatedAt})
)`;

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function orderNumber(value: number): string {
  return `PED-${String(value).padStart(6, '0')}`;
}

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(input: {
    segment?: CustomerSegment;
    query?: string;
    limit: number;
    after?: CustomerCursor;
  }): Promise<{
    items: readonly CustomerSummary[];
    nextCursor: CustomerCursor | null;
  }> {
    const limit = Math.max(1, Math.min(100, input.limit));
    const pattern =
      input.query === undefined
        ? undefined
        : `%${escapeLikePattern(input.query.trim())}%`;
    const rows = await this.database.orm
      .select({
        id: customers.id,
        displayName: customers.displayName,
        normalizedPhone: customers.normalizedPhone,
        segment: segmentSql,
        marketingConsent: customers.marketingConsent,
        lastActivityAt: lastActivitySql,
        createdAt: customers.createdAt,
        cursorCreatedAt: sql<string>`to_char(${customers.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(customers)
      .where(
        and(
          input.segment === undefined
            ? undefined
            : sql`${segmentSql} = ${input.segment}`,
          pattern === undefined
            ? undefined
            : sql`(${customers.displayName} ILIKE ${pattern} ESCAPE '\\' OR ${customers.normalizedPhone} ILIKE ${pattern} ESCAPE '\\')`,
          input.after === undefined
            ? undefined
            : sql`(${customers.createdAt}, ${customers.id}) < (${input.after.createdAt}::timestamptz, ${input.after.id}::uuid)`,
        ),
      )
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        normalizedPhone: row.normalizedPhone,
        segment: row.segment,
        marketingConsent:
          row.marketingConsent as CustomerSummary['marketingConsent'],
        lastActivityAt: row.lastActivityAt,
        createdAt: row.createdAt,
      })),
      nextCursor:
        rows.length > limit && last !== undefined
          ? { createdAt: last.cursorCreatedAt, id: last.id }
          : null,
    };
  }

  async get(id: string): Promise<CustomerDetail | null> {
    const [row] = await this.database.orm
      .select({
        id: customers.id,
        displayName: customers.displayName,
        normalizedPhone: customers.normalizedPhone,
        segment: segmentSql,
        marketingConsent: customers.marketingConsent,
        lastActivityAt: lastActivitySql,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    if (row === undefined) return null;
    const [orders, conversations] = await Promise.all([
      this.database.orm
        .select({
          id: salesOrders.id,
          orderNumber: salesOrders.orderNumber,
          status: salesOrders.status,
          createdAt: salesOrders.createdAt,
        })
        .from(salesOrders)
        .where(eq(salesOrders.customerId, id))
        .orderBy(desc(salesOrders.createdAt), desc(salesOrders.id)),
      this.database.orm
        .select({
          id: whatsappConversations.id,
          customerPhone: whatsappConversations.customerPhone,
          state: whatsappConversations.state,
          updatedAt: whatsappConversations.updatedAt,
        })
        .from(whatsappConversations)
        .where(eq(whatsappConversations.customerId, id))
        .orderBy(
          desc(whatsappConversations.updatedAt),
          desc(whatsappConversations.id),
        ),
    ]);
    return {
      id: row.id,
      displayName: row.displayName,
      normalizedPhone: row.normalizedPhone,
      segment: row.segment,
      marketingConsent:
        row.marketingConsent as CustomerSummary['marketingConsent'],
      lastActivityAt: row.lastActivityAt,
      createdAt: row.createdAt,
      orders: orders.map((order) => ({
        ...order,
        orderNumber: orderNumber(order.orderNumber),
      })),
      conversations,
    };
  }

  async reconciliation(limit: number): Promise<CustomerReconciliation> {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const [orders, conversations] = await Promise.all([
      this.database.orm
        .select({
          id: salesOrders.id,
          orderNumber: salesOrders.orderNumber,
          customerName: salesOrders.customerName,
          customerPhone: salesOrders.customerPhone,
          status: salesOrders.status,
          createdAt: salesOrders.createdAt,
        })
        .from(salesOrders)
        .where(sql`${salesOrders.customerId} IS NULL`)
        .orderBy(desc(salesOrders.createdAt), desc(salesOrders.id))
        .limit(boundedLimit),
      this.database.orm
        .select({
          id: whatsappConversations.id,
          customerPhone: whatsappConversations.customerPhone,
          state: whatsappConversations.state,
          createdAt: whatsappConversations.createdAt,
        })
        .from(whatsappConversations)
        .where(sql`${whatsappConversations.customerId} IS NULL`)
        .orderBy(
          desc(whatsappConversations.createdAt),
          desc(whatsappConversations.id),
        )
        .limit(boundedLimit),
    ]);
    return {
      orders: orders.map((order) => ({
        ...order,
        orderNumber: orderNumber(order.orderNumber),
        href: `/orders/${order.id}`,
      })),
      conversations: conversations.map((conversation) => ({
        ...conversation,
        href: `/conversations?conversation=${conversation.id}`,
      })),
    };
  }
}
