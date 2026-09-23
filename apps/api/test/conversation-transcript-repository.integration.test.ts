import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { PostgresConversationTranscriptRepository } from '../src/modules/conversations/postgres-conversation-transcript-repository.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('conversation transcript persistence', () => {
  beforeAll(() => runMigrations(databaseUrl));

  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_conversation_messages, whatsapp_outbound_messages, whatsapp_conversation_events, whatsapp_conversations CASCADE`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('stores duplicate inbound once and advances outbound delivery in place', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const conversations = new PostgresConversationRepository(database);
      const outbound = new PostgresOutboundRepository(database);
      const transcript = new PostgresConversationTranscriptRepository(database);
      const input = {
        whatsappMessageId: 'wamid.inbound-1',
        customerPhone: '+573001234567',
        text: '37',
      };

      const first = await conversations.receive(input);
      await conversations.receive(input);
      const conversationId = first.conversationId!;
      const queued = await outbound.enqueueText({
        conversationId,
        customerPhone: input.customerPhone,
        body: '¿Te gusta alguno?',
        idempotencyKey: 'transcript-outbound-1',
      });
      await outbound.enqueueText({
        conversationId,
        customerPhone: input.customerPhone,
        body: '¿Te gusta alguno?',
        idempotencyKey: 'transcript-outbound-1',
      });
      expect((await outbound.claimNext())?.id).toBe(queued.id);
      await outbound.markSent(queued.id, 'wamid.outbound-1');
      await transcript.updateProviderStatus('wamid.outbound-1', 'delivered');
      await transcript.updateProviderStatus('wamid.outbound-1', 'read');

      const page = await transcript.listMessages(conversationId, 20);
      expect(page.items).toHaveLength(2);
      expect(page.items.map((item) => [item.source, item.status])).toEqual([
        ['customer', 'received'],
        ['bot', 'read'],
      ]);
      expect(page.items[1]?.providerMessageId).toBe('wamid.outbound-1');
    } finally {
      await database.close();
    }
  });

  it('preserves every transcript row when timestamps differ only by microseconds', async () => {
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const guideJobId = randomUUID();
    const orderId = randomUUID();
    const referenceId = randomUUID();
    const referenceCode = `TEST-${guideJobId.slice(0, 20).toUpperCase()}`;
    const occurredAt = new Date('2026-09-10T15:00:00.000Z');
    let orderNumber: number;
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001234567', 'complete', ${occurredAt})
      `;
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${referenceCode}, 'Tenis de prueba', 'Negro', 120000)
      `;
      const [createdOrder] = await sql<{ order_number: number }[]>`
        INSERT INTO sales_orders (id, reference_id, size, quantity, status)
        VALUES (${orderId}, ${referenceId}, 37, 1, 'confirmed')
        RETURNING order_number
      `;
      orderNumber = createdOrder!.order_number;
      await sql`
        INSERT INTO shipping_guide_jobs
          (id, order_id, status, carrier, pre_shipment_number)
        VALUES (${guideJobId}, ${orderId}, 'created', 'envia', 'PRE-12345')
      `;
      await sql`
        INSERT INTO whatsapp_conversation_messages
          (id, conversation_id, source, message_type, text_body, status,
           provider_message_id, occurred_at, guide_job_id, guide_order_id)
        VALUES
          ('00000000-0000-4000-8000-000000000001', ${conversationId}, 'customer', 'text', 'Hola', 'received', 'wamid.in-1', TIMESTAMPTZ '2026-09-10 15:00:00.000100+00', NULL, NULL),
          ('00000000-0000-4000-8000-000000000002', ${conversationId}, 'bot', 'text', 'Mensaje en el mismo instante', 'sent', 'wamid.out-tie', TIMESTAMPTZ '2026-09-10 15:00:00.000400+00', NULL, NULL),
          ('00000000-0000-4000-8000-000000000003', ${conversationId}, 'system', 'event', NULL, 'internal', NULL, TIMESTAMPTZ '2026-09-10 15:00:00.000400+00', ${guideJobId}, ${orderId}),
          ('00000000-0000-4000-8000-000000000004', ${conversationId}, 'bot', 'text', 'Mensaje posterior', 'sent', 'wamid.out-1', TIMESTAMPTZ '2026-09-10 15:00:00.000700+00', NULL, NULL),
          ('00000000-0000-4000-8000-000000000005', ${conversationId}, 'customer', 'text', 'Mensaje más reciente', 'received', 'wamid.in-2', TIMESTAMPTZ '2026-09-10 15:00:00.000900+00', NULL, NULL)
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const database = createPostgresDatabase(databaseUrl);
    try {
      const transcript = new PostgresConversationTranscriptRepository(database);
      const page1 = await transcript.listMessages(conversationId, 1);
      const page2 = await transcript.listMessages(
        conversationId,
        1,
        page1.nextCursor ?? undefined,
      );
      const page3 = await transcript.listMessages(
        conversationId,
        1,
        page2.nextCursor ?? undefined,
      );
      const page4 = await transcript.listMessages(
        conversationId,
        1,
        page3.nextCursor ?? undefined,
      );
      const page5 = await transcript.listMessages(
        conversationId,
        1,
        page4.nextCursor ?? undefined,
      );

      expect(page1.items.map((item) => item.id)).toEqual([
        '00000000-0000-4000-8000-000000000005',
      ]);
      expect(page2.items.map((item) => item.id)).toEqual([
        '00000000-0000-4000-8000-000000000004',
      ]);
      expect(page3.items[0]).toMatchObject({
        id: '00000000-0000-4000-8000-000000000003',
        source: 'system',
        messageType: 'event',
        status: 'internal',
        providerMessageId: null,
        mediaUrl: null,
        orderId,
        orderNumber: `PED-${String(orderNumber).padStart(6, '0')}`,
        guideJobId,
        preShipmentNumber: 'PRE-12345',
        carrier: 'envia',
      });
      expect(page4.items.map((item) => item.id)).toEqual([
        '00000000-0000-4000-8000-000000000002',
      ]);
      expect(page5.items.map((item) => item.id)).toEqual([
        '00000000-0000-4000-8000-000000000001',
      ]);
      expect(page5.nextCursor).toBeNull();
      expect(
        [page1, page2, page3, page4, page5].flatMap((page) =>
          page.items.map((item) => item.id),
        ),
      ).toEqual([
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001',
      ]);

      const outbound = new PostgresOutboundRepository(database);
      await expect(outbound.claimNext()).resolves.toBeNull();
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [queued] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        `;
        expect(queued?.count).toBe(0);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
