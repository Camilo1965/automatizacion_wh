import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { GuideDeliveryService } from '../src/modules/shipping/guide-delivery-service.js';
import type { ShippingGuideOperations } from '../src/modules/shipping/shipping-guide-service.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const referenceId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const guideId = '44444444-4444-4444-8444-444444444444';
const sha = 'a'.repeat(64);

describe('guide delivery PostgreSQL eligibility', () => {
  const database = createPostgresDatabase(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    await sql`TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_conversations, shipping_guide_jobs, sales_orders, catalog_references CASCADE`;
    await sql`
      INSERT INTO catalog_references (id, code, model_name, color, price_cop)
      VALUES (${referenceId}, '01', 'Tenis', 'Negro', 120000)
    `;
    await sql`
      INSERT INTO sales_orders (id, reference_id, size, quantity, customer_name, customer_phone, status)
      VALUES (${orderId}, ${referenceId}, 37, 1, 'Ana', '+573001112233', 'confirmed')
    `;
    await sql`
      INSERT INTO shipping_guide_jobs
        (id, order_id, status, carrier, guide_pdf_storage_key, guide_pdf_sha256)
      VALUES (${guideId}, ${orderId}, 'created', 'envia', 'guides/order.pdf', ${sha})
    `;
  });
  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await database.close();
  });

  async function insertConversation(sendGuideToCustomer: boolean) {
    const snapshot = {
      optionalSteps: { sendGuideToCustomer },
      steps: { guide: { message: 'Guía lista para {{nombre}}' } },
    };
    await sql`
      INSERT INTO whatsapp_conversations
        (id, customer_phone, state, mode, last_inbound_message_at, active_order_id, flow_snapshot)
      VALUES
        (${conversationId}, '+573001112233', 'awaiting_size', 'bot', now(), ${orderId}, ${sql.json(snapshot)}::jsonb)
    `;
  }

  function service(fetchPdf: ReturnType<typeof vi.fn>) {
    return new GuideDeliveryService(
      database,
      { fetchPdf } as unknown as ShippingGuideOperations,
      new PostgresOutboundRepository(database),
    );
  }

  it('does not fetch or enqueue when the persisted flow disables sending guides', async () => {
    await insertConversation(false);
    await sql`
      INSERT INTO conversation_order_links (order_id, origin_conversation_id)
      VALUES (${orderId}, ${conversationId})
    `;
    await sql`
      INSERT INTO whatsapp_conversation_messages
        (conversation_id, source, message_type, status, occurred_at, guide_job_id, guide_order_id)
      VALUES
        (${conversationId}, 'system', 'event', 'internal', now(), ${guideId}, ${orderId})
    `;
    const fetchPdf = vi.fn();

    await expect(service(fetchPdf).runOnce()).resolves.toBe(false);
    expect(fetchPdf).not.toHaveBeenCalled();
    const [job] =
      await sql`SELECT pdf_delivery_attempts FROM shipping_guide_jobs WHERE id = ${guideId}`;
    const [outbox] =
      await sql`SELECT count(*)::int AS count FROM whatsapp_outbound_messages`;
    const [internalEvent] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM whatsapp_conversation_messages
      WHERE guide_job_id = ${guideId} AND source = 'system' AND status = 'internal'
    `;
    expect(job?.pdf_delivery_attempts).toBe(0);
    expect(outbox?.count).toBe(0);
    expect(internalEvent?.count).toBe(1);
  });

  it('enqueues one document and excludes it from later selection by idempotency key', async () => {
    await insertConversation(true);
    const fetchPdf = vi.fn().mockResolvedValue({});
    const delivery = service(fetchPdf);

    await expect(delivery.runOnce()).resolves.toBe(true);
    await sql`UPDATE shipping_guide_jobs SET pdf_last_attempt_at = NULL WHERE id = ${guideId}`;
    await expect(delivery.runOnce()).resolves.toBe(false);

    const messages = await sql`
      SELECT idempotency_key, message_type, media_storage_key, text_body
      FROM whatsapp_outbound_messages
    `;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      idempotency_key: `guide:${guideId}:${sha}`,
      message_type: 'document',
      media_storage_key: 'guides/order.pdf',
      text_body: 'Guía lista para Ana',
    });
    expect(fetchPdf).toHaveBeenCalledTimes(1);
  });
});
