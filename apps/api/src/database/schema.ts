import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 64 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('admin_users_username_unique').on(table.username),
    check(
      'admin_users_username_format',
      sql`${table.username} ~ '^[a-z0-9._-]{3,64}$'`,
    ),
  ],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    unique('admin_sessions_token_hash_unique').on(table.tokenHash),
    check(
      'admin_sessions_token_hash_format',
      sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    index('admin_sessions_valid_lookup_idx').on(
      table.tokenHash,
      table.expiresAt,
      table.revokedAt,
    ),
    index('admin_sessions_user_id_idx').on(table.userId),
  ],
);

export const catalogReferences = pgTable(
  'catalog_references',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    modelName: varchar('model_name', { length: 120 }).notNull(),
    color: varchar('color', { length: 80 }).notNull(),
    priceCop: integer('price_cop').notNull(),
    photoStorageKey: varchar('photo_storage_key', { length: 255 }),
    photoMimeType: varchar('photo_mime_type', { length: 32 }),
    photoByteSize: integer('photo_byte_size'),
    photoSha256: char('photo_sha256', { length: 64 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('catalog_references_code_unique').on(table.code),
    check(
      'catalog_references_code_format',
      sql`${table.code} ~ '^[A-Z0-9-]+$'`,
    ),
    check('catalog_references_price_positive', sql`${table.priceCop} > 0`),
    check(
      'catalog_references_photo_all_or_none',
      sql`(
        (${table.photoStorageKey} IS NULL AND ${table.photoMimeType} IS NULL AND ${table.photoByteSize} IS NULL AND ${table.photoSha256} IS NULL)
        OR
        (${table.photoStorageKey} IS NOT NULL AND ${table.photoMimeType} IS NOT NULL AND ${table.photoByteSize} IS NOT NULL AND ${table.photoSha256} IS NOT NULL)
      )`,
    ),
    check(
      'catalog_references_photo_byte_size_positive',
      sql`${table.photoByteSize} IS NULL OR ${table.photoByteSize} > 0`,
    ),
    check(
      'catalog_references_photo_mime_type',
      sql`${table.photoMimeType} IS NULL OR ${table.photoMimeType} IN ('image/jpeg', 'image/png')`,
    ),
    check(
      'catalog_references_photo_sha256_format',
      sql`${table.photoSha256} IS NULL OR ${table.photoSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const catalogStock = pgTable(
  'catalog_stock',
  {
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => catalogReferences.id, { onDelete: 'restrict' }),
    size: numeric('size', { precision: 4, scale: 1 }).notNull(),
    physicalQuantity: integer('physical_quantity').notNull(),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'catalog_stock_pkey',
      columns: [table.referenceId, table.size],
    }),
    check(
      'catalog_stock_size_range',
      sql`${table.size} >= 1 AND ${table.size} <= 99.5`,
    ),
    check(
      'catalog_stock_size_half_steps',
      sql`(${table.size} * 2) = trunc(${table.size} * 2)`,
    ),
    check(
      'catalog_stock_quantities_non_negative',
      sql`${table.physicalQuantity} >= 0 AND ${table.reservedQuantity} >= 0`,
    ),
    check(
      'catalog_stock_reserved_lte_physical',
      sql`${table.reservedQuantity} <= ${table.physicalQuantity}`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => catalogReferences.id, { onDelete: 'restrict' }),
    size: numeric('size', { precision: 4, scale: 1 }).notNull(),
    previousQuantity: integer('previous_quantity').notNull(),
    newQuantity: integer('new_quantity').notNull(),
    delta: integer('delta').notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    note: varchar('note', { length: 250 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'inventory_movements_delta_consistent',
      sql`${table.delta} = ${table.newQuantity} - ${table.previousQuantity}`,
    ),
    check(
      'inventory_movements_reason_allowed',
      sql`${table.reason} IN ('initial', 'manual_adjustment')`,
    ),
    check(
      'inventory_movements_quantities_non_negative',
      sql`${table.previousQuantity} >= 0 AND ${table.newQuantity} >= 0`,
    ),
  ],
);

export const schema = {
  adminUsers,
  adminSessions,
  catalogReferences,
  catalogStock,
  inventoryMovements,
};
