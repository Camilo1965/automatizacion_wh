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

import { salesOrders } from './orders.js';

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

export const localityCatalogVersions = pgTable('locality_catalog_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceSha256: char('source_sha256', { length: 64 }).notNull(),
  sourceType: varchar('source_type', { length: 24 }).notNull(),
  rows: jsonb('rows').notNull(),
  issues: jsonb('issues').notNull(),
  baseVersionId: uuid('base_version_id'),
  status: varchar('status', { length: 16 }).notNull().default('preview'),
  author: varchar('author', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

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
    policyConfig: jsonb('policy_config'),
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
    policyConfig: jsonb('policy_config'),
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

export const shippingIncidents = pgTable('shipping_incidents', {
  id: integer('id').primaryKey(),
  preShipmentNumber: varchar('pre_shipment_number', { length: 64 }).notNull(),
  orderId: uuid('order_id').references(() => salesOrders.id),
  description: text('description').notNull(),
  observations: text('observations'),
  response: text('response'),
  responseStatus: varchar('response_status', { length: 16 })
    .notNull()
    .default('open'),
  author: varchar('author', { length: 64 }),
  syncedAt: timestamp('synced_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
});

export const shippingGuideJobs = pgTable(
  'shipping_guide_jobs',
  {
    policySnapshot: jsonb('policy_snapshot'),
    confirmedTotalCop: integer('confirmed_total_cop'),
    pdfDeliveryAttempts: integer('pdf_delivery_attempts').notNull().default(0),
    pdfLastAttemptAt: timestamp('pdf_last_attempt_at', { withTimezone: true }),
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
