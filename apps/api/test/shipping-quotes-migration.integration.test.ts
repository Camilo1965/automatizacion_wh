import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { runMigrations } from '../src/database/migrate.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('shipping quote migration', () => {
  beforeAll(() => runMigrations(databaseUrl));

  it('creates quote persistence and PDF metadata without removing guide jobs', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'shipping_quotes'
      `;
      expect(tables).toHaveLength(1);

      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'shipping_guide_jobs'
      `;
      expect(columns.map((column) => column.column_name)).toEqual(
        expect.arrayContaining([
          'quote_id',
          'guide_pdf_fetched_at',
          'guide_pdf_sha256',
          'guide_pdf_byte_size',
          'guide_pdf_storage_key',
        ]),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
