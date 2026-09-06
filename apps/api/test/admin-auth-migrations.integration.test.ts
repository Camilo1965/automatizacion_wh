import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { runMigrations } from '../src/database/migrate.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();

describe('admin auth migrations', () => {
  beforeAll(async () => {
    assertTestDatabaseName(testDatabaseUrl);
    await runMigrations(testDatabaseUrl);
  });

  it('applies migrations idempotently a second time', async () => {
    await expect(runMigrations(testDatabaseUrl)).resolves.toBeUndefined();
  });

  it('creates admin auth tables with constraints and indexes', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('admin_users', 'admin_sessions')
        ORDER BY table_name
      `;
      expect(tables.map((row) => row.table_name)).toEqual([
        'admin_sessions',
        'admin_users',
      ]);

      const checks = await sql<{ conname: string }[]>`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN (
          'admin_users_username_format',
          'admin_users_username_unique',
          'admin_sessions_token_hash_format',
          'admin_sessions_token_hash_unique',
          'admin_sessions_user_id_admin_users_id_fk'
        )
        ORDER BY conname
      `;
      expect(checks.map((row) => row.conname)).toEqual([
        'admin_sessions_token_hash_format',
        'admin_sessions_token_hash_unique',
        'admin_sessions_user_id_admin_users_id_fk',
        'admin_users_username_format',
        'admin_users_username_unique',
      ]);

      const indexes = await sql<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'admin_sessions_valid_lookup_idx',
            'admin_sessions_user_id_idx'
          )
        ORDER BY indexname
      `;
      expect(indexes.map((row) => row.indexname)).toEqual([
        'admin_sessions_user_id_idx',
        'admin_sessions_valid_lookup_idx',
      ]);

      const historical = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'catalog_references',
            'catalog_stock',
            'inventory_movements'
          )
        ORDER BY table_name
      `;
      expect(historical.map((row) => row.table_name)).toEqual([
        'catalog_references',
        'catalog_stock',
        'inventory_movements',
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('rejects invalid and duplicate admin auth rows and enforces FK', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE admin_sessions, admin_users RESTART IDENTITY CASCADE`;

      await sql`
        INSERT INTO admin_users (username, password_hash)
        VALUES ('camila', 'scrypt$hash')
      `;

      await expect(
        sql`
          INSERT INTO admin_users (username, password_hash)
          VALUES ('camila', 'scrypt$other')
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO admin_users (username, password_hash)
          VALUES ('AB', 'scrypt$hash')
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO admin_users (username, password_hash)
          VALUES ('bad!', 'scrypt$hash')
        `,
      ).rejects.toThrow();

      const users = await sql<{ id: string }[]>`
        SELECT id FROM admin_users WHERE username = 'camila'
      `;
      const userId = users[0]?.id;
      expect(userId).toBeDefined();

      const tokenHash =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      await sql`
        INSERT INTO admin_sessions (user_id, token_hash, expires_at)
        VALUES (${userId!}, ${tokenHash}, NOW() + INTERVAL '1 hour')
      `;

      await expect(
        sql`
          INSERT INTO admin_sessions (user_id, token_hash, expires_at)
          VALUES (${userId!}, ${tokenHash}, NOW() + INTERVAL '1 hour')
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO admin_sessions (user_id, token_hash, expires_at)
          VALUES (
            ${userId!},
            'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
            NOW() + INTERVAL '1 hour'
          )
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO admin_sessions (user_id, token_hash, expires_at)
          VALUES (
            '11111111-1111-4111-8111-111111111111',
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            NOW() + INTERVAL '1 hour'
          )
        `,
      ).rejects.toThrow();
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
