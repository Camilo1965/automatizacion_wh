import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { runMigrations } from '../src/database/migrate.js';
import {
  createTemporaryTestDatabase,
  dropTemporaryTestDatabase,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const drizzleFolder = path.resolve(moduleDirectory, '../drizzle');
const catalogCoreSql = path.join(drizzleFolder, '0000_catalog_core.sql');

const baseTestDatabaseUrl = requireTestDatabaseUrl();

function buildSingleMigrationFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'camila-0000-only-'));
  copyFileSync(catalogCoreSql, path.join(folder, '0000_catalog_core.sql'));
  mkdirSync(path.join(folder, 'meta'));
  writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    `${JSON.stringify(
      {
        version: '7',
        dialect: 'postgresql',
        entries: [
          {
            idx: 0,
            version: '7',
            when: 1788666104788,
            tag: '0000_catalog_core',
            breakpoints: true,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return folder;
}

describe('admin auth upgrade migration 0000 → 0001', () => {
  let tempDatabaseUrl: string | undefined;
  let tempDatabaseName: string | undefined;
  let singleMigrationFolder: string | undefined;

  afterAll(async () => {
    if (singleMigrationFolder !== undefined) {
      rmSync(singleMigrationFolder, { recursive: true, force: true });
    }
    if (tempDatabaseName !== undefined) {
      await dropTemporaryTestDatabase(baseTestDatabaseUrl, tempDatabaseName);
    }
  });

  it('upgrades catalog-only DB to admin auth without losing data', async () => {
    const created = await createTemporaryTestDatabase(baseTestDatabaseUrl);
    tempDatabaseUrl = created.databaseUrl;
    tempDatabaseName = created.databaseName;
    singleMigrationFolder = buildSingleMigrationFolder();

    await runMigrations(tempDatabaseUrl, singleMigrationFolder);

    const sql = postgres(tempDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO catalog_references (code, model_name, color, price_cop)
        VALUES ('01', 'Ballerina', 'Negro', 120000)
      `;

      const references = await sql<{ id: string }[]>`
        SELECT id FROM catalog_references WHERE code = '01'
      `;
      const referenceId = references[0]?.id;
      expect(referenceId).toBeDefined();

      await sql`
        INSERT INTO catalog_stock (
          reference_id,
          size,
          physical_quantity,
          reserved_quantity
        )
        VALUES (${referenceId!}, 37, 5, 1)
      `;

      await sql`
        INSERT INTO inventory_movements (
          reference_id,
          size,
          previous_quantity,
          new_quantity,
          delta,
          reason,
          note
        )
        VALUES (
          ${referenceId!},
          37,
          0,
          5,
          5,
          'initial',
          'Carga inicial upgrade'
        )
      `;

      const adminBefore = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('admin_users', 'admin_sessions')
      `;
      expect(adminBefore).toEqual([]);

      const catalogBefore = await sql<
        {
          code: string;
          physical_quantity: number;
          reserved_quantity: number;
          movement_count: string;
        }[]
      >`
        SELECT
          r.code,
          s.physical_quantity,
          s.reserved_quantity,
          (
            SELECT COUNT(*)::text
            FROM inventory_movements m
            WHERE m.reference_id = r.id
          ) AS movement_count
        FROM catalog_references r
        JOIN catalog_stock s ON s.reference_id = r.id
        WHERE r.code = '01'
      `;
      expect(catalogBefore).toEqual([
        {
          code: '01',
          physical_quantity: 5,
          reserved_quantity: 1,
          movement_count: '1',
        },
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }

    await runMigrations(tempDatabaseUrl);

    const after = postgres(tempDatabaseUrl, { max: 1, prepare: false });
    try {
      const adminTables = await after<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('admin_users', 'admin_sessions')
        ORDER BY table_name
      `;
      expect(adminTables.map((row) => row.table_name)).toEqual([
        'admin_sessions',
        'admin_users',
      ]);

      const checks = await after<{ conname: string }[]>`
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

      const indexes = await after<{ indexname: string }[]>`
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

      const catalogAfter = await after<
        {
          code: string;
          model_name: string;
          color: string;
          price_cop: number;
          physical_quantity: number;
          reserved_quantity: number;
          movement_note: string | null;
          movement_delta: number;
        }[]
      >`
        SELECT
          r.code,
          r.model_name,
          r.color,
          r.price_cop,
          s.physical_quantity,
          s.reserved_quantity,
          m.note AS movement_note,
          m.delta AS movement_delta
        FROM catalog_references r
        JOIN catalog_stock s ON s.reference_id = r.id
        JOIN inventory_movements m ON m.reference_id = r.id
        WHERE r.code = '01'
      `;
      expect(catalogAfter).toEqual([
        {
          code: '01',
          model_name: 'Ballerina',
          color: 'Negro',
          price_cop: 120000,
          physical_quantity: 5,
          reserved_quantity: 1,
          movement_note: 'Carga inicial upgrade',
          movement_delta: 5,
        },
      ]);

      const migrationRowsBefore = await after<{ id: number; hash: string }[]>`
        SELECT id, hash
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `;
      expect(migrationRowsBefore.length).toBeGreaterThanOrEqual(2);
      expect(new Set(migrationRowsBefore.map((row) => row.hash)).size).toBe(
        migrationRowsBefore.length,
      );

      await expect(runMigrations(tempDatabaseUrl)).resolves.toBeUndefined();

      const migrationRowsAfter = await after<{ id: number; hash: string }[]>`
        SELECT id, hash
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `;
      expect(migrationRowsAfter).toEqual(migrationRowsBefore);

      const catalogUnchanged = await after<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM catalog_references
      `;
      expect(catalogUnchanged[0]?.count).toBe('1');
    } finally {
      await after.end({ timeout: 5 });
    }
  });
});
