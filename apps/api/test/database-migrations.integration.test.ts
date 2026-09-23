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

import { ConversationMessagePublicSchema } from '@camila/contracts';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationTranscriptRepository } from '../src/modules/conversations/postgres-conversation-transcript-repository.js';
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

function buildMigrationFolderThrough(lastIncludedIndex: number): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'camila-migrations-through-'));
  const journal = JSON.parse(
    readFileSync(path.join(drizzleFolder, 'meta', '_journal.json'), 'utf8'),
  ) as MigrationJournal;
  const entries = journal.entries.filter(
    (entry) => entry.idx <= lastIncludedIndex,
  );

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
  let stagedMigrationsFolder: string | undefined;

  beforeAll(async () => {
    assertTestDatabaseName(testDatabaseUrl);
    await runMigrations(testDatabaseUrl);
  });

  afterAll(async () => {
    if (stagedMigrationsFolder !== undefined) {
      rmSync(stagedMigrationsFolder, { recursive: true, force: true });
    }
    if (temporaryDatabaseName !== undefined) {
      await dropTemporaryTestDatabase(testDatabaseUrl, temporaryDatabaseName);
    }
  });

  it('backfills only guides with a provable source conversation and is idempotent', async () => {
    const created = await createTemporaryTestDatabase(testDatabaseUrl);
    temporaryDatabaseName = created.databaseName;
    stagedMigrationsFolder = buildMigrationFolderThrough(34);
    await runMigrations(created.databaseUrl, stagedMigrationsFolder);

    const sql = postgres(created.databaseUrl, { max: 1, prepare: false });
    const referenceId = '11111111-1111-4111-8111-111111111111';
    const linkedOrderId = '22222222-2222-4222-8222-222222222222';
    const unlinkedOrderId = '33333333-3333-4333-8333-333333333333';
    const incompleteOrderId = '77777777-7777-4777-8777-777777777777';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const incompleteConversationId = '88888888-8888-4888-8888-888888888888';
    const linkedGuideId = '55555555-5555-4555-8555-555555555555';
    const unlinkedGuideId = '66666666-6666-4666-8666-666666666666';
    const incompleteGuideId = '99999999-9999-4999-8999-999999999999';

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
          (${unlinkedOrderId}, ${referenceId}, 38, 1, 'Luz', '+573001112244', 'confirmed'),
          (${incompleteOrderId}, ${referenceId}, 39, 1, 'Eva', '+573001112255', 'confirmed')
      `;
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, mode, last_inbound_message_at, active_order_id)
        VALUES
          (${conversationId}, '+573001112233', 'awaiting_size', 'bot', now(), ${linkedOrderId})
      `;
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, mode, last_inbound_message_at, active_order_id)
        VALUES
          (${incompleteConversationId}, '+573001112255', 'awaiting_size', 'bot', now(), ${incompleteOrderId})
      `;
      await sql`
        INSERT INTO shipping_guide_jobs
          (id, order_id, status, carrier, pre_shipment_number)
        VALUES
          (${linkedGuideId}, ${linkedOrderId}, 'created', 'envia', 'PRE-MIGRATION-1'),
          (${unlinkedGuideId}, ${unlinkedOrderId}, 'created', 'envia', 'PRE-MIGRATION-2'),
          (${incompleteGuideId}, ${incompleteOrderId}, 'created', 'envia', NULL)
      `;

      const through0035Folder = buildMigrationFolderThrough(35);
      try {
        await runMigrations(created.databaseUrl, through0035Folder);
      } finally {
        rmSync(through0035Folder, { recursive: true, force: true });
      }

      // Simulate a legacy 0035 install that already backfilled a malformed row
      // before the guard was added to the source migration.
      await sql`
        INSERT INTO whatsapp_conversation_messages
          (conversation_id, source, message_type, status, occurred_at,
           guide_job_id, guide_order_id)
        VALUES
          (${incompleteConversationId}, 'system', 'event', 'internal', now(),
           ${incompleteGuideId}, ${incompleteOrderId})
      `;
      await sql`
        INSERT INTO whatsapp_conversation_messages
          (conversation_id, source, message_type, text_body, status, occurred_at)
        VALUES
          (${incompleteConversationId}, 'customer', 'text', 'Hola', 'received', now())
      `;

      const preCleanupDatabase = createPostgresDatabase(created.databaseUrl);
      try {
        const transcript = new PostgresConversationTranscriptRepository(
          preCleanupDatabase,
        );
        await expect(
          transcript.listMessages(incompleteConversationId),
        ).rejects.toThrow('Internal guide event is missing required metadata');
      } finally {
        await preCleanupDatabase.close();
      }

      await runMigrations(created.databaseUrl);

      const linkedEvents = await sql<
        { conversation_id: string; guide_job_id: string }[]
      >`
        SELECT conversation_id, guide_job_id
        FROM whatsapp_conversation_messages
        WHERE guide_job_id IN (${linkedGuideId}, ${unlinkedGuideId}, ${incompleteGuideId})
        ORDER BY guide_job_id
      `;
      const orderLinks = await sql<
        { order_id: string; origin_conversation_id: string }[]
      >`
        SELECT order_id, origin_conversation_id
        FROM conversation_order_links
        WHERE order_id IN (${linkedOrderId}, ${unlinkedOrderId}, ${incompleteOrderId})
        ORDER BY order_id
      `;
      const [linkedOrder] = await sql<{ order_number: string }[]>`
        SELECT order_number::text AS order_number FROM sales_orders WHERE id = ${linkedOrderId}
      `;

      expect(linkedEvents).toEqual([
        { conversation_id: conversationId, guide_job_id: linkedGuideId },
      ]);
      expect(orderLinks).toEqual([
        { order_id: linkedOrderId, origin_conversation_id: conversationId },
        {
          order_id: incompleteOrderId,
          origin_conversation_id: incompleteConversationId,
        },
      ]);

      const [preservedMessages] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM whatsapp_conversation_messages
        WHERE conversation_id = ${incompleteConversationId}
          AND source = 'customer' AND message_type = 'text' AND text_body = 'Hola'
      `;
      const [preservedJobs] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM shipping_guide_jobs
        WHERE id IN (${linkedGuideId}, ${unlinkedGuideId}, ${incompleteGuideId})
      `;
      const [preservedOrders] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM sales_orders
        WHERE id IN (${linkedOrderId}, ${unlinkedOrderId}, ${incompleteOrderId})
      `;
      expect(preservedMessages?.count).toBe(1);
      expect(preservedJobs?.count).toBe(3);
      expect(preservedOrders?.count).toBe(3);

      const database = createPostgresDatabase(created.databaseUrl);
      try {
        const transcript = new PostgresConversationTranscriptRepository(
          database,
        );
        const linkedPage = await transcript.listMessages(conversationId);
        expect(linkedPage.items).toHaveLength(1);
        const guideEvent = linkedPage.items[0]!;
        expect(guideEvent).toMatchObject({
          id: expect.any(String),
          conversationId,
          source: 'system',
          messageType: 'event',
          text: null,
          mediaUrl: null,
          status: 'internal',
          providerMessageId: null,
          orderId: linkedOrderId,
          orderNumber: `PED-${linkedOrder?.order_number.padStart(6, '0')}`,
          guideJobId: linkedGuideId,
          preShipmentNumber: 'PRE-MIGRATION-1',
          carrier: 'envia',
          occurredAt: expect.any(Date),
        });
        const serializedGuideEvent = {
          ...guideEvent,
          occurredAt: guideEvent.occurredAt.toISOString(),
        };
        expect(
          ConversationMessagePublicSchema.safeParse(serializedGuideEvent)
            .success,
        ).toBe(true);
        await expect(
          transcript.listMessages(incompleteConversationId),
        ).resolves.toMatchObject({
          items: [{ source: 'customer', text: 'Hola' }],
          nextCursor: null,
        });
      } finally {
        await database.close();
      }

      await runMigrations(created.databaseUrl);
      const [eventCount] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM whatsapp_conversation_messages
        WHERE guide_job_id IN (${linkedGuideId}, ${unlinkedGuideId}, ${incompleteGuideId})
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
