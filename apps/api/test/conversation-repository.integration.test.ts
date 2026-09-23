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
      await sql`TRUNCATE TABLE customers, whatsapp_conversation_events, whatsapp_conversations, bot_flow_drafts, bot_flow_versions, catalog_references CASCADE`;
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

  it('reuses one customer identity per normalized phone and separates other phones', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await repository.receive({
        whatsappMessageId: 'wamid.identity-first',
        customerPhone: '+573001212121',
        text: 'Hola',
      });
      await repository.receive({
        whatsappMessageId: 'wamid.identity-second',
        customerPhone: '573001212121',
        text: '37',
      });
      await repository.receive({
        whatsappMessageId: 'wamid.identity-other',
        customerPhone: '+573001212122',
        text: 'Hola',
      });

      const identities = await sql<
        { customer_id: string | null; customer_phone: string }[]
      >`
        SELECT customer_phone, customer_id
        FROM whatsapp_conversations
        ORDER BY customer_phone
      `;
      expect(identities).toHaveLength(2);
      expect(identities[0]?.customer_id).not.toBeNull();
      expect(identities[1]?.customer_id).not.toBeNull();
      expect(identities[0]?.customer_id).not.toBe(identities[1]?.customer_id);
      const [profileCount] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM customers
      `;
      expect(profileCount?.count).toBe(2);
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('leaves conversations unlinked when the matching contact needs review', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await repository.receive({
        whatsappMessageId: 'wamid.review-first',
        customerPhone: '+573001919191',
        text: 'Hola',
      });
      await sql`
        UPDATE customers SET needs_review = true
        WHERE normalized_phone = '+573001919191'
      `;
      const result = await repository.receive({
        whatsappMessageId: 'wamid.review-second',
        customerPhone: '+573001919191',
        text: '37',
      });
      const [conversation] = await sql<{ customer_id: string | null }[]>`
        SELECT customer_id FROM whatsapp_conversations
        WHERE customer_phone = '+573001919191'
      `;
      expect(result.customerId).toBeNull();
      expect(conversation?.customer_id).toBeNull();
    } finally {
      await sql.end({ timeout: 5 });
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
        const [identities] = await sql<{ customers: number; linked: number }[]>`
          SELECT count(DISTINCT customer.id)::int AS customers,
            count(DISTINCT conversation.customer_id)::int AS linked
          FROM whatsapp_conversations AS conversation
          LEFT JOIN customers AS customer ON customer.id = conversation.customer_id
        `;
        expect(identities).toEqual({ customers: 1, linked: 1 });
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
