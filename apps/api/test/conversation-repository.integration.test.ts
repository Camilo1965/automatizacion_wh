import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('conversation persistence', () => {
  beforeAll(async () => {
    assertTestDatabaseName(databaseUrl);
    await runMigrations(databaseUrl);
  });

  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_conversation_events, whatsapp_conversations, bot_flow_drafts, bot_flow_versions, catalog_references CASCADE`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('creates awaiting_size once for a duplicated first message', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    try {
      const first = await repository.receive({
        whatsappMessageId: 'wamid.first',
        customerPhone: '+573001234567',
        text: 'Hola',
      });
      const replay = await repository.receive({
        whatsappMessageId: 'wamid.first',
        customerPhone: '+573001234567',
        text: 'Hola',
      });
      expect(first).toMatchObject({
        duplicate: false,
        state: 'awaiting_size',
        reply: '¡Hola! Soy KAIRO. ¿Qué talla buscas?',
      });
      expect(replay).toMatchObject({ duplicate: true, reply: null });
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [countRow] = await sql<{ events: number }[]>`
          SELECT count(*)::int AS events FROM whatsapp_conversation_events
        `;
        expect(countRow?.events).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('assigns distinct ordered sequences to concurrent messages', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    try {
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          repository.receive({
            whatsappMessageId: `wamid.concurrent-${index}`,
            customerPhone: '+573009999999',
            text: String(35 + index / 2),
          }),
        ),
      );
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const rows = await sql<{ sequence: number }[]>`
          SELECT sequence FROM whatsapp_conversation_events ORDER BY sequence
        `;
        expect(rows.map((row) => row.sequence)).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        ]);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('records the inbound event without replying while the owner is in control', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    try {
      await repository.receive({
        whatsappMessageId: 'wamid.human-setup',
        customerPhone: '+573008888888',
        text: 'Hola',
      });
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await sql`UPDATE whatsapp_conversations SET mode = 'human' WHERE customer_phone = '+573008888888'`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      const result = await repository.receive({
        whatsappMessageId: 'wamid.human-message',
        customerPhone: '+573008888888',
        text: '37',
      });
      expect(result).toMatchObject({ duplicate: false, reply: null });
    } finally {
      await database.close();
    }
  });

  it('keeps each order linked to its original conversation when a later order becomes active', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const first = await repository.receive({
        whatsappMessageId: 'wamid.guide-origin',
        customerPhone: '+573001111222',
        text: 'Hola',
      });
      const conversationId = first.conversationId!;
      const referenceId = '22222222-2222-4222-8222-222222222222';
      const firstOrderId = '11111111-1111-4111-8111-111111111111';
      const secondOrderId = '33333333-3333-4333-8333-333333333333';
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, '01', 'Tenis', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (id, reference_id, size, quantity, status)
        VALUES (${firstOrderId}, ${referenceId}, 37, 1, 'draft'),
               (${secondOrderId}, ${referenceId}, 38, 1, 'draft')
      `;

      await repository.attachOrder(conversationId, referenceId, firstOrderId);
      await repository.attachOrder(conversationId, referenceId, firstOrderId);
      await repository.attachOrder(conversationId, referenceId, secondOrderId);

      const links = await sql<
        { order_id: string; origin_conversation_id: string }[]
      >`
        SELECT order_id, origin_conversation_id FROM conversation_order_links
        ORDER BY order_id
      `;
      expect(links).toEqual([
        { order_id: firstOrderId, origin_conversation_id: conversationId },
        { order_id: secondOrderId, origin_conversation_id: conversationId },
      ]);
      const [active] = await sql<{ active_order_id: string }[]>`
        SELECT active_order_id FROM whatsapp_conversations WHERE id = ${conversationId}
      `;
      expect(active?.active_order_id).toBe(secondOrderId);
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });
});
