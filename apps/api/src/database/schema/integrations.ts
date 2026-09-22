import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const integrationDrafts = pgTable('integration_drafts', {
  publicConfiguration: jsonb('public_configuration').notNull().default({}),
  provider: varchar('provider', { length: 16 }).primaryKey(),
  encryptedPayload: text('encrypted_payload').notNull(),
  revision: integer('revision').notNull().default(1),
  testedRevision: integer('tested_revision'),
  testedAt: timestamp('tested_at', { withTimezone: true }),
  author: varchar('author', { length: 64 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const integrationVersions = pgTable('integration_versions', {
  publicConfiguration: jsonb('public_configuration').notNull().default({}),
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 16 }).notNull(),
  encryptedPayload: text('encrypted_payload').notNull(),
  revision: integer('revision').notNull(),
  author: varchar('author', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: varchar('status', { length: 16 }).notNull().default('active'),
});

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
