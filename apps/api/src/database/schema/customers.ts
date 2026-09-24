import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('display_name', { length: 120 }),
    normalizedPhone: varchar('normalized_phone', { length: 13 }),
    marketingConsent: varchar('marketing_consent', { length: 16 })
      .notNull()
      .default('unknown'),
    marketingConsentChannel: varchar('marketing_consent_channel', {
      length: 64,
    }),
    marketingConsentPurpose: varchar('marketing_consent_purpose', {
      length: 128,
    }),
    marketingConsentNoticeVersion: varchar('marketing_consent_notice_version', {
      length: 64,
    }),
    marketingConsentEvidenceRef: varchar('marketing_consent_evidence_ref', {
      length: 128,
    }),
    marketingConsentRecordedAt: timestamp('marketing_consent_recorded_at', {
      withTimezone: true,
    }),
    needsReview: boolean('needs_review').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('customers_normalized_phone_unique').on(table.normalizedPhone),
    check(
      'customers_normalized_phone_format',
      sql`${table.normalizedPhone} ~ '^\\+573[0-9]{9}$'`,
    ),
    check(
      'customers_anonymized_phone_profile_consistent',
      sql`${table.normalizedPhone} IS NOT NULL OR (${table.displayName} IS NULL AND ${table.needsReview} = true AND ${table.marketingConsent} = 'unknown' AND ${table.marketingConsentChannel} IS NULL AND ${table.marketingConsentPurpose} IS NULL AND ${table.marketingConsentNoticeVersion} IS NULL AND ${table.marketingConsentEvidenceRef} IS NULL AND ${table.marketingConsentRecordedAt} IS NULL)`,
    ),
    check(
      'customers_marketing_consent_allowed',
      sql`${table.marketingConsent} IN ('unknown', 'granted', 'denied', 'revoked')`,
    ),
    check(
      'customers_marketing_consent_evidence_consistent',
      sql`(${table.marketingConsent} = 'unknown'
          AND ${table.marketingConsentChannel} IS NULL
          AND ${table.marketingConsentPurpose} IS NULL
          AND ${table.marketingConsentNoticeVersion} IS NULL
          AND ${table.marketingConsentEvidenceRef} IS NULL
          AND ${table.marketingConsentRecordedAt} IS NULL)
        OR (${table.marketingConsent} IN ('granted', 'denied', 'revoked')
          AND NULLIF(BTRIM(${table.marketingConsentChannel}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.marketingConsentPurpose}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.marketingConsentNoticeVersion}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.marketingConsentEvidenceRef}), '') IS NOT NULL
          AND ${table.marketingConsentRecordedAt} IS NOT NULL)`,
    ),
    index('customers_needs_review_created_idx').on(
      table.needsReview,
      table.createdAt,
      table.id,
    ),
  ],
);
