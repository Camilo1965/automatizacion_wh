import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type {
  CatalogImportRowError,
  ParsedCatalogImportReference,
} from '../modules/catalog/catalog-import-csv.js';

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
      sql`${table.reason} IN ('initial', 'manual_adjustment', 'order_dispatched', 'order_returned')`,
    ),
    check(
      'inventory_movements_quantities_non_negative',
      sql`${table.previousQuantity} >= 0 AND ${table.newQuantity} >= 0`,
    ),
  ],
);

export const catalogImports = pgTable(
  'catalog_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sha256: char('sha256', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    referencesData: jsonb('references_data')
      .$type<readonly ParsedCatalogImportReference[]>()
      .notNull(),
    errorsData: jsonb('errors_data')
      .$type<readonly CatalogImportRowError[]>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'catalog_imports_sha256_format',
      sql`${table.sha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'catalog_imports_status_allowed',
      sql`${table.status} IN ('previewed', 'invalid', 'committed')`,
    ),
    check(
      'catalog_imports_commit_state',
      sql`(${table.status} = 'committed') = (${table.committedAt} IS NOT NULL)`,
    ),
    index('catalog_imports_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const shippingLocalities = pgTable(
  'shipping_localities',
  {
    carrierCode: varchar('carrier_code', { length: 32 }).primaryKey(),
    department: varchar('department', { length: 100 }).notNull(),
    locality: varchar('locality', { length: 120 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 240 }).notNull(),
    country: char('country', { length: 2 }).notNull().default('CO'),
    sourceSha256: char('source_sha256', { length: 64 }).notNull(),
    active: boolean('active').notNull().default(true),
    importedAt: timestamp('imported_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('shipping_localities_country_co', sql`${table.country} = 'CO'`),
    check(
      'shipping_localities_sha256_format',
      sql`${table.sourceSha256} ~ '^[a-f0-9]{64}$'`,
    ),
    index('shipping_localities_search_idx').on(
      table.department,
      table.normalizedName,
    ),
  ],
);

export const shippingLocalityImports = pgTable(
  'shipping_locality_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceSha256: char('source_sha256', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 24 }).notNull(),
    importedCount: integer('imported_count').notNull(),
    issues: jsonb('issues').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('shipping_locality_imports_source_sha256_unique').on(
      table.sourceSha256,
    ),
    check(
      'shipping_locality_imports_sha256_format',
      sql`${table.sourceSha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'shipping_locality_imports_source_type_allowed',
      sql`${table.sourceType} IN ('csv', '99envios_document')`,
    ),
    check(
      'shipping_locality_imports_imported_count_valid',
      sql`${table.importedCount} >= 0`,
    ),
  ],
);

export const integrationSettings = pgTable(
  'integration_settings',
  {
    provider: varchar('provider', { length: 16 }).primaryKey(),
    encryptedPayload: text('encrypted_payload').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'integration_settings_provider_allowed',
      sql`${table.provider} IN ('whatsapp', 'shipping')`,
    ),
    check(
      'integration_settings_encrypted_payload_format',
      sql`${table.encryptedPayload} ~ '^v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$'`,
    ),
  ],
);

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

export const whatsappInboundMessages = pgTable(
  'whatsapp_inbound_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    whatsappMessageId: varchar('whatsapp_message_id', {
      length: 128,
    }).notNull(),
    businessPhoneNumberId: varchar('business_phone_number_id', {
      length: 32,
    }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    messageType: varchar('message_type', { length: 32 }).notNull(),
    textBody: text('text_body'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_inbound_messages_message_id_unique').on(
      table.whatsappMessageId,
    ),
    index('whatsapp_inbound_messages_customer_received_idx').on(
      table.customerPhone,
      table.receivedAt,
    ),
  ],
);

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    state: varchar('state', { length: 32 }).notNull(),
    mode: varchar('mode', { length: 8 }).notNull().default('bot'),
    selectedSize: numeric('selected_size', { precision: 4, scale: 1 }),
    selectedReferenceId: uuid('selected_reference_id').references(
      () => catalogReferences.id,
      { onDelete: 'restrict' },
    ),
    activeOrderId: uuid('active_order_id').references(() => salesOrders.id, {
      onDelete: 'restrict',
    }),
    activeMenuVersion: integer('active_menu_version').notNull().default(0),
    invalidAttempts: integer('invalid_attempts').notNull().default(0),
    pendingDepartment: varchar('pending_department', { length: 100 }),
    activeSummaryVersion: integer('active_summary_version'),
    lastInboundMessageAt: timestamp('last_inbound_message_at', {
      withTimezone: true,
    }).notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_conversations_customer_phone_unique').on(
      table.customerPhone,
    ),
    check(
      'whatsapp_conversations_mode_allowed',
      sql`${table.mode} IN ('bot', 'human')`,
    ),
    check(
      'whatsapp_conversations_invalid_attempts_non_negative',
      sql`${table.invalidAttempts} >= 0`,
    ),
  ],
);

export const whatsappConversationMessages = pgTable(
  'whatsapp_conversation_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'restrict' }),
    outboundMessageId: uuid('outbound_message_id'),
    providerMessageId: varchar('provider_message_id', { length: 128 }),
    source: varchar('source', { length: 16 }).notNull(),
    messageType: varchar('message_type', { length: 16 }).notNull(),
    textBody: text('text_body'),
    mediaStorageKey: varchar('media_storage_key', { length: 255 }),
    mediaMimeType: varchar('media_mime_type', { length: 32 }),
    status: varchar('status', { length: 16 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_conversation_messages_provider_unique').on(
      table.providerMessageId,
    ),
    unique('whatsapp_conversation_messages_outbound_unique').on(
      table.outboundMessageId,
    ),
    check(
      'whatsapp_conversation_messages_source_allowed',
      sql`${table.source} IN ('customer', 'bot', 'owner_panel', 'owner_mobile')`,
    ),
    check(
      'whatsapp_conversation_messages_type_allowed',
      sql`${table.messageType} IN ('text', 'image', 'template', 'event')`,
    ),
    check(
      'whatsapp_conversation_messages_status_allowed',
      sql`${table.status} IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled')`,
    ),
    index('whatsapp_conversation_messages_conversation_time_idx').on(
      table.conversationId,
      table.occurredAt,
      table.id,
    ),
  ],
);

export const whatsappConversationEvents = pgTable(
  'whatsapp_conversation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'restrict' }),
    whatsappMessageId: varchar('whatsapp_message_id', {
      length: 128,
    }).notNull(),
    sequence: integer('sequence').notNull(),
    stateBefore: varchar('state_before', { length: 32 }),
    stateAfter: varchar('state_after', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_conversation_events_message_unique').on(
      table.whatsappMessageId,
    ),
    unique('whatsapp_conversation_events_sequence_unique').on(
      table.conversationId,
      table.sequence,
    ),
    index('whatsapp_conversation_events_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const whatsappCatalogMenus = pgTable(
  'whatsapp_catalog_menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    confirmedSize: numeric('confirmed_size', {
      precision: 4,
      scale: 1,
    }).notNull(),
    nextAfterCode: varchar('next_after_code', { length: 32 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_catalog_menus_version_unique').on(
      table.conversationId,
      table.version,
    ),
    index('whatsapp_catalog_menus_active_idx').on(
      table.conversationId,
      table.active,
    ),
  ],
);

export const whatsappCatalogMenuOptions = pgTable(
  'whatsapp_catalog_menu_options',
  {
    menuId: uuid('menu_id')
      .notNull()
      .references(() => whatsappCatalogMenus.id, { onDelete: 'restrict' }),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => catalogReferences.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    modelName: varchar('model_name', { length: 120 }).notNull(),
    color: varchar('color', { length: 80 }).notNull(),
    priceCop: integer('price_cop').notNull(),
    photoStorageKey: varchar('photo_storage_key', { length: 255 }).notNull(),
    photoMimeType: varchar('photo_mime_type', { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'whatsapp_catalog_menu_options_pkey',
      columns: [table.menuId, table.referenceId],
    }),
    unique('whatsapp_catalog_menu_options_position_unique').on(
      table.menuId,
      table.position,
    ),
    unique('whatsapp_catalog_menu_options_code_unique').on(
      table.menuId,
      table.code,
    ),
    check(
      'whatsapp_catalog_menu_options_mime_allowed',
      sql`${table.photoMimeType} IN ('image/jpeg', 'image/png')`,
    ),
  ],
);

export const whatsappOutboundMessages = pgTable(
  'whatsapp_outbound_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id').references(
      () => whatsappConversations.id,
      { onDelete: 'restrict' },
    ),
    idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    source: varchar('source', { length: 16 }).notNull().default('bot'),
    messageType: varchar('message_type', { length: 16 }).notNull(),
    textBody: text('text_body'),
    mediaStorageKey: varchar('media_storage_key', { length: 255 }),
    mediaMimeType: varchar('media_mime_type', { length: 32 }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    whatsappMessageId: varchar('whatsapp_message_id', { length: 128 }),
    errorCode: varchar('error_code', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('whatsapp_outbound_messages_idempotency_unique').on(
      table.idempotencyKey,
    ),
    check(
      'whatsapp_outbound_messages_source_allowed',
      sql`${table.source} IN ('bot', 'owner_panel', 'owner_mobile')`,
    ),
    check(
      'whatsapp_outbound_messages_type_allowed',
      sql`${table.messageType} IN ('text', 'image')`,
    ),
    check(
      'whatsapp_outbound_messages_status_allowed',
      sql`${table.status} IN ('pending', 'processing', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      'whatsapp_outbound_messages_attempt_non_negative',
      sql`${table.attemptCount} >= 0`,
    ),
    index('whatsapp_outbound_messages_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const shippingQuotes = pgTable(
  'shipping_quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    draftVersion: integer('draft_version').notNull(),
    carrier: varchar('carrier', { length: 32 }).notNull(),
    serviceId: integer('service_id').notNull(),
    freightCop: integer('freight_cop').notNull(),
    cashOnDeliveryCop: integer('cash_on_delivery_cop').notNull(),
    surchargeCop: integer('surcharge_cop').notNull(),
    insuranceMode: varchar('insurance_mode', { length: 8 })
      .notNull()
      .default('none'),
    insuranceCop: integer('insurance_cop').notNull().default(0),
    policySnapshot: jsonb('policy_snapshot'),
    estimatedDays: varchar('estimated_days', { length: 32 }).notNull(),
    quotedAt: timestamp('quoted_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    recommended: boolean('recommended').notNull().default(false),
    selected: boolean('selected').notNull().default(false),
  },
  (table) => [
    check(
      'shipping_quotes_draft_version_positive',
      sql`${table.draftVersion} >= 1`,
    ),
    check(
      'shipping_quotes_cop_non_negative',
      sql`${table.freightCop} >= 0 AND ${table.cashOnDeliveryCop} >= 0 AND ${table.surchargeCop} >= 0 AND ${table.insuranceCop} >= 0`,
    ),
    check(
      'shipping_quotes_insurance_mode_allowed',
      sql`${table.insuranceMode} IN ('none', 'standard', 'plus')`,
    ),
    check(
      'shipping_quotes_expiry_after_quote',
      sql`${table.expiresAt} > ${table.quotedAt}`,
    ),
    unique('shipping_quotes_order_carrier_insurance_version_unique').on(
      table.orderId,
      table.draftVersion,
      table.carrier,
      table.insuranceMode,
    ),
    uniqueIndex('shipping_quotes_one_selected_per_order')
      .on(table.orderId)
      .where(sql`${table.selected}`),
  ],
);

export const shippingCarrierRules = pgTable(
  'shipping_carrier_rules',
  {
    localityCarrierCode: varchar('locality_carrier_code', {
      length: 32,
    }).primaryKey(),
    carrier: varchar('carrier', { length: 32 }),
    fallbackPolicy: varchar('fallback_policy', { length: 8 })
      .notNull()
      .default('allow'),
    offerMode: varchar('offer_mode', { length: 20 })
      .notNull()
      .default('customer_choice'),
    protectedInsurance: varchar('protected_insurance', { length: 8 })
      .notNull()
      .default('standard'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'shipping_carrier_rules_dane_format',
      sql`${table.localityCarrierCode} ~ '^[0-9]{8}$'`,
    ),
    check(
      'shipping_carrier_rules_carrier_format',
      sql`${table.carrier} IS NULL OR ${table.carrier} ~ '^[a-z0-9_-]{2,32}$'`,
    ),
    check(
      'shipping_carrier_rules_fallback_allowed',
      sql`${table.fallbackPolicy} IN ('allow', 'block')`,
    ),
    check(
      'shipping_carrier_rules_offer_mode_allowed',
      sql`${table.offerMode} IN ('customer_choice', 'economy_only', 'protected_only')`,
    ),
    check(
      'shipping_carrier_rules_insurance_allowed',
      sql`${table.protectedInsurance} IN ('standard', 'plus')`,
    ),
    check(
      'shipping_carrier_rules_block_requires_carrier',
      sql`${table.fallbackPolicy} <> 'block' OR ${table.carrier} IS NOT NULL`,
    ),
  ],
);

export const shippingPreferences = pgTable(
  'shipping_preferences',
  {
    id: boolean('id').primaryKey().default(true),
    carrier: varchar('carrier', { length: 32 }),
    fallbackPolicy: varchar('fallback_policy', { length: 8 })
      .notNull()
      .default('allow'),
    offerMode: varchar('offer_mode', { length: 20 })
      .notNull()
      .default('customer_choice'),
    protectedInsurance: varchar('protected_insurance', { length: 8 })
      .notNull()
      .default('standard'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('shipping_preferences_singleton', sql`${table.id} = true`),
    check(
      'shipping_preferences_carrier_format',
      sql`${table.carrier} IS NULL OR ${table.carrier} ~ '^[a-z0-9_-]{2,32}$'`,
    ),
    check(
      'shipping_preferences_fallback_allowed',
      sql`${table.fallbackPolicy} IN ('allow', 'block')`,
    ),
    check(
      'shipping_preferences_offer_mode_allowed',
      sql`${table.offerMode} IN ('customer_choice', 'economy_only', 'protected_only')`,
    ),
    check(
      'shipping_preferences_insurance_allowed',
      sql`${table.protectedInsurance} IN ('standard', 'plus')`,
    ),
    check(
      'shipping_preferences_block_requires_carrier',
      sql`${table.fallbackPolicy} <> 'block' OR ${table.carrier} IS NOT NULL`,
    ),
  ],
);

export const shippingObservedCarriers = pgTable('shipping_observed_carriers', {
  carrier: varchar('carrier', { length: 32 }).primaryKey(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shippingPolicyAudits = pgTable(
  'shipping_policy_audits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: varchar('scope', { length: 16 }).notNull(),
    localityCarrierCode: varchar('locality_carrier_code', { length: 32 }),
    policy: jsonb('policy').notNull(),
    action: varchar('action', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'shipping_policy_audits_scope_allowed',
      sql`${table.scope} IN ('global', 'municipality')`,
    ),
    check(
      'shipping_policy_audits_action_allowed',
      sql`${table.action} IN ('upsert', 'deactivate')`,
    ),
  ],
);

export const shippingGuideJobs = pgTable(
  'shipping_guide_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    quoteId: uuid('quote_id').references(() => shippingQuotes.id, {
      onDelete: 'restrict',
    }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    carrier: varchar('carrier', { length: 32 }).notNull().default('envia'),
    insuranceMode: varchar('insurance_mode', { length: 8 })
      .notNull()
      .default('none'),
    preShipmentNumber: varchar('pre_shipment_number', { length: 64 }),
    freightCop: integer('freight_cop'),
    errorCode: varchar('error_code', { length: 64 }),
    guidePdfFetchedAt: timestamp('guide_pdf_fetched_at', {
      withTimezone: true,
    }),
    guidePdfSha256: char('guide_pdf_sha256', { length: 64 }),
    guidePdfByteSize: integer('guide_pdf_byte_size'),
    guidePdfStorageKey: varchar('guide_pdf_storage_key', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('shipping_guide_jobs_order_unique').on(table.orderId),
    check(
      'shipping_guide_jobs_status_allowed',
      sql`${table.status} IN ('pending', 'processing', 'created', 'uncertain', 'failed')`,
    ),
    check(
      'shipping_guide_jobs_insurance_mode_allowed',
      sql`${table.insuranceMode} IN ('none', 'standard', 'plus')`,
    ),
    index('shipping_guide_jobs_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

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

export const schema = {
  adminUsers,
  adminSessions,
  catalogReferences,
  catalogStock,
  inventoryMovements,
  catalogImports,
  shippingLocalities,
  salesOrders,
  orderSummaries,
  orderConfirmations,
  reservationMovements,
  orderStatusEvents,
  whatsappInboundMessages,
  whatsappConversations,
  whatsappConversationEvents,
  whatsappConversationMessages,
  whatsappCatalogMenus,
  whatsappCatalogMenuOptions,
  whatsappOutboundMessages,
  shippingGuideJobs,
  shippingQuotes,
  shippingCarrierRules,
  shippingPreferences,
  shippingObservedCarriers,
  shippingPolicyAudits,
  ownerAlerts,
  inventoryClosures,
};
