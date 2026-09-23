import { sql } from 'drizzle-orm';
import {
  boolean,
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
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { catalogReferences } from './catalog.js';
import { salesOrders } from './orders.js';
import { shippingGuideJobs } from './shipping.js';

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

export const botFlowVersions = pgTable('bot_flow_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  revision: integer('revision').notNull().unique(),
  definition: jsonb('definition').notNull(),
  author: varchar('author', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const botFlowDrafts = pgTable('bot_flow_drafts', {
  id: varchar('id', { length: 32 }).primaryKey(),
  revision: integer('revision').notNull(),
  definition: jsonb('definition').notNull(),
  author: varchar('author', { length: 64 }).notNull(),
  activeVersionId: uuid('active_version_id').references(
    () => botFlowVersions.id,
  ),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    state: varchar('state', { length: 32 }).notNull(),
    flowVersionId: uuid('flow_version_id').references(() => botFlowVersions.id),
    flowSnapshot: jsonb('flow_snapshot'),
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

export const conversationOrderLinks = pgTable(
  'conversation_order_links',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    originConversationId: uuid('origin_conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('conversation_order_links_conversation_idx').on(
      table.originConversationId,
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
    guideJobId: uuid('guide_job_id').references(() => shippingGuideJobs.id, {
      onDelete: 'restrict',
    }),
    guideOrderId: uuid('guide_order_id').references(() => salesOrders.id, {
      onDelete: 'restrict',
    }),
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
    unique('whatsapp_conversation_messages_guide_job_unique').on(
      table.guideJobId,
    ),
    check(
      'whatsapp_conversation_messages_source_allowed',
      sql`${table.source} IN ('customer', 'bot', 'owner_panel', 'owner_mobile', 'system')`,
    ),
    check(
      'whatsapp_conversation_messages_type_allowed',
      sql`${table.messageType} IN ('text', 'image', 'document', 'template', 'event')`,
    ),
    check(
      'whatsapp_conversation_messages_status_allowed',
      sql`${table.status} IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'internal')`,
    ),
    check(
      'whatsapp_conversation_messages_guide_event_valid',
      sql`(${table.guideJobId} IS NULL AND ${table.guideOrderId} IS NULL)
        OR (${table.guideJobId} IS NOT NULL AND ${table.guideOrderId} IS NOT NULL
          AND ${table.source} = 'system' AND ${table.messageType} = 'event'
          AND ${table.status} = 'internal')`,
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
      sql`${table.messageType} IN ('text', 'image', 'document')`,
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
