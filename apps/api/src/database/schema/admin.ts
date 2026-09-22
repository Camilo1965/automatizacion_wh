import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  jsonb,
  pgTable,
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
    role: varchar('role', { length: 16 }).notNull().default('owner'),
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
    check(
      'admin_users_role_check',
      sql`${table.role} IN ('owner', 'operator')`,
    ),
  ],
);

export const adminMfaSecrets = pgTable('admin_mfa_secrets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  encryptedSecret: text('encrypted_secret').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminMfaRecoveryCodes = pgTable(
  'admin_mfa_recovery_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    codeHash: char('code_hash', { length: 64 }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('admin_mfa_recovery_codes_user_id_idx').on(table.userId),
    unique('admin_mfa_recovery_codes_code_hash_unique').on(table.codeHash),
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
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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

/**
 * Unified append-only security and business audit log.
 * Raw IP is never stored; `ip_hash` is optional and unused until legally approved.
 */
export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id'),
    actorUsername: varchar('actor_username', { length: 64 }),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: varchar('target_id', { length: 128 }),
    correlationId: varchar('correlation_id', { length: 64 }),
    metadata: jsonb('metadata').notNull().default({}),
    result: varchar('result', { length: 16 }).notNull(),
    ipHash: char('ip_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'admin_audit_events_result_check',
      sql`${table.result} IN ('success', 'failure')`,
    ),
    check(
      'admin_audit_events_ip_hash_format',
      sql`${table.ipHash} IS NULL OR ${table.ipHash} ~ '^[a-f0-9]{64}$'`,
    ),
    index('admin_audit_events_created_at_idx').on(table.createdAt),
    index('admin_audit_events_actor_user_id_idx').on(table.actorUserId),
    index('admin_audit_events_action_idx').on(table.action),
    index('admin_audit_events_target_idx').on(table.targetType, table.targetId),
  ],
);
