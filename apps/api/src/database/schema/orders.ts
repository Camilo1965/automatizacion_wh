import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { adminUsers } from './admin.js';
import { catalogReferences } from './catalog.js';

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: bigint('order_number', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => catalogReferences.id, { onDelete: 'restrict' }),
    size: numeric('size', { precision: 4, scale: 1 }).notNull(),
    quantity: integer('quantity').notNull(),
    customerName: varchar('customer_name', { length: 120 }),
    customerPhone: varchar('customer_phone', { length: 13 }),
    address: varchar('address', { length: 180 }),
    localityCarrierCode: varchar('locality_carrier_code', { length: 32 }),
    localityDepartment: varchar('locality_department', { length: 100 }),
    localityName: varchar('locality_name', { length: 120 }),
    deliveryNotes: varchar('delivery_notes', { length: 250 }),
    draftVersion: integer('draft_version').notNull().default(1),
    latestSummaryVersion: integer('latest_summary_version')
      .notNull()
      .default(0),
    confirmedSummaryVersion: integer('confirmed_summary_version'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('sales_orders_order_number_unique').on(table.orderNumber),
    check(
      'sales_orders_status_allowed',
      sql`${table.status} IN ('draft', 'confirmed', 'cancelled', 'dispatched', 'delivered', 'returned')`,
    ),
    check(
      'sales_orders_quantity_range',
      sql`${table.quantity} BETWEEN 1 AND 10`,
    ),
    check(
      'sales_orders_size_half_steps',
      sql`(${table.size} * 2) = trunc(${table.size} * 2)`,
    ),
    check(
      'sales_orders_draft_version_positive',
      sql`${table.draftVersion} >= 1`,
    ),
    check(
      'sales_orders_summary_versions_valid',
      sql`${table.latestSummaryVersion} >= 0 AND (${table.confirmedSummaryVersion} IS NULL OR ${table.confirmedSummaryVersion} >= 1)`,
    ),
    index('sales_orders_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    index('sales_orders_reference_size_idx').on(table.referenceId, table.size),
  ],
);

export const orderSummaries = pgTable(
  'order_summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    draftVersion: integer('draft_version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('order_summaries_order_version_unique').on(
      table.orderId,
      table.version,
    ),
    check('order_summaries_version_positive', sql`${table.version} >= 1`),
    check(
      'order_summaries_draft_version_positive',
      sql`${table.draftVersion} >= 1`,
    ),
  ],
);

export const orderConfirmations = pgTable(
  'order_confirmations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    summaryVersion: integer('summary_version').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('order_confirmations_order_unique').on(table.orderId),
    unique('order_confirmations_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    check(
      'order_confirmations_summary_version_positive',
      sql`${table.summaryVersion} >= 1`,
    ),
  ],
);

export const reservationMovements = pgTable(
  'reservation_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => catalogReferences.id, { onDelete: 'restrict' }),
    size: numeric('size', { precision: 4, scale: 1 }).notNull(),
    previousReservedQuantity: integer('previous_reserved_quantity').notNull(),
    newReservedQuantity: integer('new_reserved_quantity').notNull(),
    delta: integer('delta').notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'reservation_movements_delta_consistent',
      sql`${table.delta} = ${table.newReservedQuantity} - ${table.previousReservedQuantity}`,
    ),
    check(
      'reservation_movements_quantities_non_negative',
      sql`${table.previousReservedQuantity} >= 0 AND ${table.newReservedQuantity} >= 0`,
    ),
    check(
      'reservation_movements_reason_allowed',
      sql`${table.reason} IN ('confirmed', 'cancelled', 'dispatched')`,
    ),
    index('reservation_movements_order_created_at_idx').on(
      table.orderId,
      table.createdAt,
    ),
  ],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    previousStatus: varchar('previous_status', { length: 16 }),
    nextStatus: varchar('next_status', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 250 }),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'order_status_events_next_status_allowed',
      sql`${table.nextStatus} IN ('draft', 'confirmed', 'cancelled', 'dispatched', 'delivered', 'returned')`,
    ),
    index('order_status_events_order_created_at_idx').on(
      table.orderId,
      table.createdAt,
    ),
  ],
);
