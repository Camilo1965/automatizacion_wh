import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import {
  assertTestDatabaseName,
  createTemporaryTestDatabase,
  dropTemporaryTestDatabase,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const drizzleFolder = path.resolve(moduleDirectory, '../drizzle');

type MigrationJournal = {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

function buildPreGuideMigrationFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'camila-pre-guide-'));
  const journal = JSON.parse(
    readFileSync(path.join(drizzleFolder, 'meta', '_journal.json'), 'utf8'),
  ) as MigrationJournal;
  const entries = journal.entries.filter((entry) => entry.idx < 35);

  for (const entry of entries) {
    copyFileSync(
      path.join(drizzleFolder, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  mkdirSync(path.join(folder, 'meta'));
  writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  return folder;
}

describe('database migrations', () => {
  let temporaryDatabaseName: string | undefined;
  let preGuideMigrationsFolder: string | undefined;

  beforeAll(async () => {
    assertTestDatabaseName(testDatabaseUrl);
    await runMigrations(testDatabaseUrl);
  });

  afterAll(async () => {
    if (preGuideMigrationsFolder !== undefined) {
      rmSync(preGuideMigrationsFolder, { recursive: true, force: true });
    }
    if (temporaryDatabaseName !== undefined) {
      await dropTemporaryTestDatabase(testDatabaseUrl, temporaryDatabaseName);
    }
  });

  it('backfills only guides with a provable source conversation and is idempotent', async () => {
    const created = await createTemporaryTestDatabase(testDatabaseUrl);
    temporaryDatabaseName = created.databaseName;
    preGuideMigrationsFolder = buildPreGuideMigrationFolder();
    await runMigrations(created.databaseUrl, preGuideMigrationsFolder);

    const sql = postgres(created.databaseUrl, { max: 1, prepare: false });
    const referenceId = '11111111-1111-4111-8111-111111111111';
    const linkedOrderId = '22222222-2222-4222-8222-222222222222';
    const unlinkedOrderId = '33333333-3333-4333-8333-333333333333';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const linkedGuideId = '55555555-5555-4555-8555-555555555555';
    const unlinkedGuideId = '66666666-6666-4666-8666-666666666666';

    try {
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, 'MIG-GUIDE', 'Tenis', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders
          (id, reference_id, size, quantity, customer_name, customer_phone, status)
        VALUES
          (${linkedOrderId}, ${referenceId}, 37, 1, 'Ana', '+573001112233', 'confirmed'),
          (${unlinkedOrderId}, ${referenceId}, 38, 1, 'Luz', '+573001112244', 'confirmed')
      `;
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, mode, last_inbound_message_at, active_order_id)
        VALUES
          (${conversationId}, '+573001112233', 'awaiting_size', 'bot', now(), ${linkedOrderId})
      `;
      await sql`
        INSERT INTO shipping_guide_jobs (id, order_id, status, carrier)
        VALUES
          (${linkedGuideId}, ${linkedOrderId}, 'created', 'envia'),
          (${unlinkedGuideId}, ${unlinkedOrderId}, 'created', 'envia')
      `;

      await runMigrations(created.databaseUrl);

      const linkedEvents = await sql<
        { conversation_id: string; guide_job_id: string }[]
      >`
        SELECT conversation_id, guide_job_id
        FROM whatsapp_conversation_messages
        WHERE guide_job_id IN (${linkedGuideId}, ${unlinkedGuideId})
      `;
      const orderLinks = await sql<
        { order_id: string; origin_conversation_id: string }[]
      >`
        SELECT order_id, origin_conversation_id
        FROM conversation_order_links
        WHERE order_id IN (${linkedOrderId}, ${unlinkedOrderId})
      `;

      expect(linkedEvents).toEqual([
        { conversation_id: conversationId, guide_job_id: linkedGuideId },
      ]);
      expect(orderLinks).toEqual([
        { order_id: linkedOrderId, origin_conversation_id: conversationId },
      ]);

      await runMigrations(created.databaseUrl);
      const [eventCount] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM whatsapp_conversation_messages
        WHERE guide_job_id IN (${linkedGuideId}, ${unlinkedGuideId})
      `;
      expect(eventCount?.count).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
    }
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
