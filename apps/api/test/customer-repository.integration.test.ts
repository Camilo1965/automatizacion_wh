import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresCustomerRepository } from '../src/modules/customers/postgres-customer-repository.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const buyer = '11111111-1111-4111-8111-111111111111';
const pending = '22222222-2222-4222-8222-222222222222';
const review = '33333333-3333-4333-8333-333333333333';
const returned = '44444444-4444-4444-8444-444444444444';

describe('customer read model', () => {
  beforeAll(async () => {
    assertTestDatabaseName(databaseUrl);
    await runMigrations(databaseUrl);
  });
  beforeEach(async () => {
    const sql = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    try {
      await sql`TRUNCATE TABLE customers, sales_orders, whatsapp_conversations, catalog_references CASCADE`;
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '01', 'Zapato', 'Negro', 100000)`;
      await sql`INSERT INTO customers (id, display_name, normalized_phone, needs_review, created_at)
        VALUES (${buyer}, 'Ana', '+573001111111', false, '2026-09-20T10:00:00.123454Z'),
               (${pending}, 'Beatriz', '+573002222222', false, '2026-09-20T10:00:00.123455Z'),
               (${review}, NULL, '+573003333333', true, '2026-09-20T10:00:00.123456Z'),
               (${returned}, 'Diana', '+573004444444', false, '2026-09-20T10:00:00.123457Z')`;
      await sql`INSERT INTO sales_orders (id, status, reference_id, size, quantity, customer_id, customer_name, customer_phone, created_at)
        VALUES ('10000000-0000-4000-8000-000000000001', 'delivered', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${buyer}, 'Ana', '+573001111111', '2026-09-21T10:00:00Z'),
               ('10000000-0000-4000-8000-000000000002', 'returned', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${buyer}, 'Ana', '+573001111111', '2026-09-22T10:00:00Z'),
               ('10000000-0000-4000-8000-000000000003', 'confirmed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${pending}, 'Beatriz', '+573002222222', '2026-09-22T10:00:00Z'),
               ('10000000-0000-4000-8000-000000000004', 'delivered', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${review}, 'Persona', '+573003333333', '2026-09-22T10:00:00Z'),
               ('10000000-0000-4000-8000-000000000005', 'returned', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${returned}, 'Diana', '+573004444444', '2026-09-22T10:00:00Z'),
               ('10000000-0000-4000-8000-000000000006', 'draft', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, NULL, 'Sin enlazar', NULL, '2026-09-22T11:00:00Z'),
               ('10000000-0000-4000-8000-000000000007', 'draft', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${pending}, 'Beatriz', '+573002222222', '2026-09-22T12:00:00Z'),
               ('10000000-0000-4000-8000-000000000008', 'dispatched', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${pending}, 'Beatriz', '+573002222222', '2026-09-22T13:00:00Z'),
               ('10000000-0000-4000-8000-000000000009', 'cancelled', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, ${pending}, 'Beatriz', '+573002222222', '2026-09-22T14:00:00Z'),
               ('10000000-0000-4000-8000-000000000010', 'draft', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, NULL, 'Sin enlazar 2', NULL, '2026-09-22T11:00:00.000001Z'),
               ('10000000-0000-4000-8000-000000000011', 'draft', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 37, 1, NULL, 'Sin enlazar 3', NULL, '2026-09-22T11:00:00.000002Z')`;
      await sql`INSERT INTO whatsapp_conversations (id, customer_phone, customer_id, state, last_inbound_message_at, created_at)
        VALUES ('20000000-0000-4000-8000-000000000001', '+573001111111', ${buyer}, 'idle', '2026-09-22T12:00:00Z', '2026-09-22T12:00:00Z'),
               ('20000000-0000-4000-8000-000000000002', 'invalid-phone', NULL, 'idle', '2026-09-22T12:00:00Z', '2026-09-22T12:00:00Z'),
               ('20000000-0000-4000-8000-000000000003', 'invalid-phone-2', NULL, 'idle', '2026-09-22T12:00:00.000001Z', '2026-09-22T12:00:00.000001Z'),
               ('20000000-0000-4000-8000-000000000004', 'invalid-phone-3', NULL, 'idle', '2026-09-22T12:00:00.000002Z', '2026-09-22T12:00:00.000002Z')`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('derives buyer only from a currently delivered order and keeps review separate', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresCustomerRepository(database);
      expect(
        (await repository.list({ segment: 'buyer', limit: 20 })).items.map(
          (item) => item.id,
        ),
      ).toEqual([buyer]);
      expect(
        (
          await repository.list({ segment: 'not_yet_buyer', limit: 20 })
        ).items.map((item) => item.id),
      ).toEqual([returned, pending]);
      expect(
        (
          await repository.list({ segment: 'needs_review', limit: 20 })
        ).items.map((item) => item.id),
      ).toEqual([review]);
    } finally {
      await database.close();
    }
  });

  it('uses a stable cursor, parameterized search, and projects no consent evidence', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresCustomerRepository(database);
      const first = await repository.list({ limit: 2 });
      const second = await repository.list({
        limit: 2,
        after: first.nextCursor!,
      });
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
        returned,
        review,
        pending,
        buyer,
      ]);
      expect(first.nextCursor).not.toBeNull();
      expect(
        (await repository.list({ query: 'Beatriz', limit: 20 })).items.map(
          (item) => item.id,
        ),
      ).toEqual([pending]);
      expect((await repository.list({ query: '%', limit: 20 })).items).toEqual(
        [],
      );
      expect(first.items[0]).not.toHaveProperty('marketingConsentEvidenceRef');
    } finally {
      await database.close();
    }
  });

  it('returns linked history and a bounded, read-only unlinked record queue', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresCustomerRepository(database);
      const detail = await repository.get(buyer);
      expect(detail?.orders.map((order) => order.status)).toEqual([
        'returned',
        'delivered',
      ]);
      expect(
        detail?.conversations.map((conversation) => conversation.id),
      ).toEqual(['20000000-0000-4000-8000-000000000001']);
      expect(
        await repository.get('99999999-9999-4999-8999-999999999999'),
      ).toBeNull();
      const queue = await repository.reconciliation({ limit: 1 });
      expect(queue.orders.map((order) => order.id)).toEqual([
        '10000000-0000-4000-8000-000000000011',
      ]);
      expect(
        queue.conversations.map((conversation) => conversation.id),
      ).toEqual(['20000000-0000-4000-8000-000000000004']);
      expect(queue.orders[0]).not.toHaveProperty('address');
      expect(queue.orders[0]).not.toHaveProperty('deliveryNotes');

      const second = await repository.reconciliation({
        limit: 1,
        ordersAfter: queue.ordersNextCursor!,
        conversationsAfter: queue.conversationsNextCursor!,
      });
      const third = await repository.reconciliation({
        limit: 1,
        ordersAfter: second.ordersNextCursor!,
        conversationsAfter: second.conversationsNextCursor!,
      });
      expect(
        [queue, second, third].flatMap((page) =>
          page.orders.map((order) => order.id),
        ),
      ).toEqual([
        '10000000-0000-4000-8000-000000000011',
        '10000000-0000-4000-8000-000000000010',
        '10000000-0000-4000-8000-000000000006',
      ]);
      expect(
        [queue, second, third].flatMap((page) =>
          page.conversations.map((conversation) => conversation.id),
        ),
      ).toEqual([
        '20000000-0000-4000-8000-000000000004',
        '20000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000002',
      ]);
      expect(third.ordersNextCursor).toBeNull();
      expect(third.conversationsNextCursor).toBeNull();
      const ordersOnly = await repository.reconciliation({
        limit: 1,
        ordersAfter: queue.ordersNextCursor!,
      });
      expect(ordersOnly.orders[0]?.id).toBe(
        '10000000-0000-4000-8000-000000000010',
      );
      expect(ordersOnly.conversations[0]?.id).toBe(
        '20000000-0000-4000-8000-000000000004',
      );
    } finally {
      await database.close();
    }
  });
});
