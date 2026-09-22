import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const ownerAlerts = pgTable(
  'owner_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 12 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    detail: text('detail').notNull(),
    entityUrl: varchar('entity_url', { length: 255 }).notNull(),
    deduplicationKey: varchar('deduplication_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('open'),
    attempts: integer('attempts').notNull().default(0),
    retrySafe: boolean('retry_safe').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('owner_alerts_open_dedup_unique')
      .on(table.deduplicationKey)
      .where(sql`${table.status} <> 'resolved'`),
    check(
      'owner_alerts_severity_allowed',
      sql`${table.severity} IN ('info', 'warning', 'critical')`,
    ),
    check(
      'owner_alerts_status_allowed',
      sql`${table.status} IN ('open', 'read', 'resolved')`,
    ),
    index('owner_alerts_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const ownerAlertDeliveries = pgTable('owner_alert_deliveries', {
  alertId: uuid('alert_id')
    .primaryKey()
    .references(() => ownerAlerts.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 16 }).notNull().default('processing'),
  messageId: varchar('message_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const configurationAudits = pgTable('configuration_audits', {
  id: uuid('id').defaultRandom().primaryKey(),
  scope: varchar('scope', { length: 64 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  author: varchar('author', { length: 64 }).notNull(),
  revision: integer('revision'),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryClosures = pgTable(
  'inventory_closures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessDate: varchar('business_date', { length: 10 }).notNull(),
    version: integer('version').notNull().default(1),
    profile: varchar('profile', { length: 16 })
      .notNull()
      .default('adjustments'),
    status: varchar('status', { length: 16 }).notNull().default('generated'),
    movementCount: integer('movement_count').notNull(),
    totalUnits: integer('total_units').notNull(),
    checksum: char('checksum', { length: 64 }).notNull(),
    csvContent: text('csv_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (table) => [
    unique('inventory_closures_date_version_unique').on(
      table.businessDate,
      table.version,
    ),
    check(
      'inventory_closures_profile_allowed',
      sql`${table.profile} IN ('absolute', 'adjustments')`,
    ),
    check(
      'inventory_closures_status_allowed',
      sql`${table.status} IN ('generated', 'acknowledged', 'reopened')`,
    ),
  ],
);
