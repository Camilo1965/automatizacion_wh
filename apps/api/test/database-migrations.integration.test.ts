import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();

describe('database migrations', () => {
  beforeAll(async () => {
    assertTestDatabaseName(testDatabaseUrl);
    await runMigrations(testDatabaseUrl);
  });

  it('applies migrations idempotently a second time', async () => {
    await expect(runMigrations(testDatabaseUrl)).resolves.toBeUndefined();
  });

  it('creates the catalog tables and drizzle migrations journal', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const tables = await sql<{ table_schema: string; table_name: string }[]>`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE
          (table_schema = 'public'
            AND table_name IN (
              'catalog_references',
              'catalog_stock',
              'inventory_movements'
            ))
          OR
          (table_schema = 'drizzle'
            AND table_name = '__drizzle_migrations')
        ORDER BY table_schema, table_name
      `;

      expect(tables).toEqual([
        { table_schema: 'drizzle', table_name: '__drizzle_migrations' },
        { table_schema: 'public', table_name: 'catalog_references' },
        { table_schema: 'public', table_name: 'catalog_stock' },
        { table_schema: 'public', table_name: 'inventory_movements' },
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('rejects invalid catalog data at the database level', async () => {
    const database = createPostgresDatabase(testDatabaseUrl);
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });

    try {
      await sql`TRUNCATE TABLE inventory_movements, catalog_stock, catalog_references RESTART IDENTITY CASCADE`;

      await sql`
        INSERT INTO catalog_references (code, model_name, color, price_cop)
        VALUES ('01', 'Modelo Uno', 'Negro', 100000)
      `;

      await expect(
        sql`
          INSERT INTO catalog_references (code, model_name, color, price_cop)
          VALUES ('01', 'Duplicado', 'Rojo', 100000)
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO catalog_references (code, model_name, color, price_cop)
          VALUES ('02', 'Modelo Dos', 'Azul', 0)
        `,
      ).rejects.toThrow();

      const reference = await sql<{ id: string }[]>`
        SELECT id FROM catalog_references WHERE code = '01'
      `;
      const referenceId = reference[0]?.id;
      expect(referenceId).toBeDefined();

      await expect(
        sql`
          INSERT INTO catalog_stock (reference_id, size, physical_quantity)
          VALUES (${referenceId!}, 37.2, 1)
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          INSERT INTO catalog_stock (reference_id, size, physical_quantity)
          VALUES (${referenceId!}, 37, -1)
        `,
      ).rejects.toThrow();

      await sql`
        INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
        VALUES (${referenceId!}, 37, 1, 0)
      `;

      await expect(
        sql`
          UPDATE catalog_stock
          SET reserved_quantity = 2
          WHERE reference_id = ${referenceId!} AND size = 37
        `,
      ).rejects.toThrow();

      await expect(
        sql`
          UPDATE catalog_references
          SET photo_storage_key = 'photo.png'
          WHERE id = ${referenceId!}
        `,
      ).rejects.toThrow();
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });
});
