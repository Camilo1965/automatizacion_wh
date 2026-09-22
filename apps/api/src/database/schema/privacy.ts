import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { adminUsers } from './admin.js';

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    version: integer('version').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    classes: jsonb('classes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(
      () => adminUsers.id,
      {
        onDelete: 'set null',
      },
    ),
    activatedByUserId: uuid('activated_by_user_id').references(
      () => adminUsers.id,
      { onDelete: 'set null' },
    ),
    note: text('note'),
  },
  (table) => [
    unique('retention_policies_version_unique').on(table.version),
    check(
      'retention_policies_status_check',
      sql`${table.status} IN ('draft', 'active', 'superseded', 'disabled')`,
    ),
  ],
);

export const retentionRuns = pgTable(
  'retention_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => retentionPolicies.id, { onDelete: 'restrict' }),
    policyVersion: integer('policy_version').notNull(),
    mode: varchar('mode', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    progress: jsonb('progress').notNull().default([]),
    cursor: jsonb('cursor').notNull().default({ classIndex: 0, lastId: null }),
    report: jsonb('report'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    actorUserId: uuid('actor_user_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    correlationId: varchar('correlation_id', { length: 64 }),
    batchSize: integer('batch_size').notNull().default(100),
  },
  (table) => [
    check(
      'retention_runs_mode_check',
      sql`${table.mode} IN ('dry_run', 'execute')`,
    ),
    check(
      'retention_runs_status_check',
      sql`${table.status} IN ('pending', 'running', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);
