import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
import { ShippingGuideWorker } from '../src/modules/shipping/shipping-guide-worker.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('shipping guide jobs', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE shipping_guide_jobs, sales_orders, catalog_references CASCADE`;
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Tenis', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (id, reference_id, size, quantity, status)
        VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 37, 1, 'confirmed')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('creates only one active job for a confirmed order', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingGuideJobRepository(database);
    try {
      const orderId = '11111111-1111-4111-8111-111111111111';
      const [first, replay] = await Promise.all([
        repository.enqueue(orderId),
        repository.enqueue(orderId),
      ]);
      expect(replay.id).toBe(first.id);
      await expect(repository.claimNext()).resolves.toMatchObject({
        id: first.id,
        orderId,
        status: 'processing',
      });
      await expect(repository.markUncertain(first.id, null)).resolves.toEqual({
        status: 'uncertain',
        preShipmentNumber: null,
      });
      await expect(repository.claimNext()).resolves.toBeNull();
    } finally {
      await database.close();
    }
  });

  it('claims the final COD value from the immutable selected quote', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO shipping_quotes
          (id, order_id, draft_version, carrier, service_id, freight_cop,
           cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at,
           expires_at, recommended, selected)
        VALUES ('33333333-3333-4333-8333-333333333333',
          '11111111-1111-4111-8111-111111111111', 1, 'envia', 12,
          13368, 3000, 600, '1', clock_timestamp(),
          clock_timestamp() + interval '30 minutes', true, true)
      `;
      await sql`
        INSERT INTO shipping_guide_jobs (order_id, quote_id, carrier)
        VALUES ('11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333', 'envia')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      await expect(
        new PostgresShippingGuideJobRepository(database).claimNext(),
      ).resolves.toMatchObject({ collectionValueCop: 136968 });
    } finally {
      await database.close();
    }
  });

  it('does not claim pending jobs when the order is not confirmed', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        UPDATE sales_orders SET status = 'draft'
        WHERE id = '11111111-1111-4111-8111-111111111111'
      `;
      await sql`
        INSERT INTO shipping_guide_jobs (order_id, carrier)
        VALUES ('11111111-1111-4111-8111-111111111111', 'envia')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      await expect(
        new PostgresShippingGuideJobRepository(database).claimNext(),
      ).resolves.toBeNull();
    } finally {
      await database.close();
    }
  });

  it('persists one internal guide event for the original conversation, even after the active order changes', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001111222', 'complete', clock_timestamp())
      `;
      await sql`
        INSERT INTO conversation_order_links (order_id, origin_conversation_id)
        VALUES (${orderId}, ${conversationId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(orderId);
      await repository.claimNext();
      await repository.markCreated(job.id, 'PRE-123', 11900);
      await repository.markCreated(job.id, 'PRE-123', 11900);
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const rows = await check<
          {
            conversation_id: string;
            guide_order_id: string;
            guide_job_id: string;
            source: string;
            message_type: string;
            status: string;
          }[]
        >`
          SELECT conversation_id, guide_order_id, guide_job_id,
            source, message_type, status
          FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id}
        `;
        expect(rows).toEqual([
          {
            conversation_id: conversationId,
            guide_order_id: orderId,
            guide_job_id: job.id,
            source: 'system',
            message_type: 'event',
            status: 'internal',
          },
        ]);
        const [outbound] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        `;
        expect(outbound?.count).toBe(0);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('does not downgrade a guide already persisted as created during late uncertainty classification', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001111222', 'complete', clock_timestamp())
      `;
      await sql`
        INSERT INTO conversation_order_links (order_id, origin_conversation_id)
        VALUES (${orderId}, ${conversationId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(orderId);
      await repository.claimNext();
      await repository.markCreated(job.id, 'PRE-ALREADY-CREATED', 11900);
      await expect(repository.markUncertain(job.id, null)).resolves.toEqual({
        status: 'created',
        preShipmentNumber: 'PRE-ALREADY-CREATED',
      });

      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [guide] = await check<
          { status: string; pre_shipment_number: string | null }[]
        >`
          SELECT status, pre_shipment_number FROM shipping_guide_jobs
          WHERE id = ${job.id}
        `;
        expect(guide).toEqual({
          status: 'created',
          pre_shipment_number: 'PRE-ALREADY-CREATED',
        });
        const [event] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id}
        `;
        expect(event?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('persists an internal guide event when an uncertain guide is reviewed', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001111222', 'complete', clock_timestamp())
      `;
      await sql`
        INSERT INTO conversation_order_links (order_id, origin_conversation_id)
        VALUES (${orderId}, ${conversationId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(orderId);
      await repository.claimNext();
      await expect(repository.markUncertain(job.id, null)).resolves.toEqual({
        status: 'uncertain',
        preShipmentNumber: null,
      });
      await expect(repository.reviewUncertain(job.id, 'PRE-456')).resolves.toBe(
        true,
      );
      await expect(repository.reviewUncertain(job.id, 'PRE-456')).resolves.toBe(
        false,
      );
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id} AND conversation_id = ${conversationId}
            AND source = 'system' AND status = 'internal'
        `;
        expect(row?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('rolls back the created guide status when inserting its conversation event fails', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001111222', 'complete', clock_timestamp())
      `;
      await sql`
        INSERT INTO conversation_order_links (order_id, origin_conversation_id)
        VALUES (${orderId}, ${conversationId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(orderId);
      await repository.claimNext();
      const injectFailure = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await injectFailure.unsafe(`
          CREATE FUNCTION reject_guide_event_insert() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.guide_job_id = '${job.id}' THEN
              RAISE EXCEPTION 'injected guide event insert failure';
            END IF;
            RETURN NEW;
          END;
          $$
        `);
        await injectFailure.unsafe(`
          CREATE TRIGGER reject_guide_event_insert
          BEFORE INSERT ON whatsapp_conversation_messages
          FOR EACH ROW EXECUTE FUNCTION reject_guide_event_insert()
        `);
      } finally {
        await injectFailure.end({ timeout: 5 });
      }

      await expect(
        repository.markCreated(job.id, 'PRE-FAIL', 11900),
      ).rejects.toThrow();

      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [guide] = await check<{ status: string }[]>`
          SELECT status FROM shipping_guide_jobs WHERE id = ${job.id}
        `;
        expect(guide?.status).toBe('processing');
        const [event] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id}
        `;
        expect(event?.count).toBe(0);
        await check`
          UPDATE shipping_guide_jobs
          SET updated_at = clock_timestamp() - interval '1 hour'
          WHERE id = ${job.id}
        `;
        await expect(repository.claimNext()).resolves.toBeNull();
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
      const cleanup = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await cleanup.unsafe(
          'DROP TRIGGER IF EXISTS reject_guide_event_insert ON whatsapp_conversation_messages',
        );
        await cleanup.unsafe(
          'DROP FUNCTION IF EXISTS reject_guide_event_insert()',
        );
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    }
  });

  it('recovers a provider-success/event-failure guide once without calling the provider again', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, last_inbound_message_at)
        VALUES (${conversationId}, '+573001111222', 'complete', clock_timestamp())
      `;
      await sql`
        INSERT INTO conversation_order_links (order_id, origin_conversation_id)
        VALUES (${orderId}, ${conversationId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(orderId);
      const injectFailure = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await injectFailure.unsafe(`
          CREATE FUNCTION reject_guide_event_insert() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.guide_job_id = '${job.id}' THEN
              RAISE EXCEPTION 'injected guide event insert failure';
            END IF;
            RETURN NEW;
          END;
          $$
        `);
        await injectFailure.unsafe(`
          CREATE TRIGGER reject_guide_event_insert
          BEFORE INSERT ON whatsapp_conversation_messages
          FOR EACH ROW EXECUTE FUNCTION reject_guide_event_insert()
        `);
      } finally {
        await injectFailure.end({ timeout: 5 });
      }
      const client = {
        createPreShipment: vi.fn().mockResolvedValue({
          preShipmentNumber: 'PRE-RECOVER-1',
          freightCop: 11900,
        }),
      };
      const incidents = { open: vi.fn().mockResolvedValue(undefined) };
      const worker = new ShippingGuideWorker(
        repository,
        {
          get: vi.fn().mockResolvedValue({
            status: 'confirmed',
            referenceModelName: 'Tenis',
            referenceCode: '01',
            unitPriceCop: 120000,
            size: '37',
            quantity: 1,
            customer: { name: 'Ana Ruiz', phone: '573001234567' },
            destination: {
              address: 'Calle 1',
              localityCarrierCode: '05001000',
              deliveryNotes: null,
            },
          }),
        },
        client,
        incidents,
      );

      await expect(worker.runOnce()).resolves.toBe(true);
      expect(client.createPreShipment).toHaveBeenCalledTimes(1);

      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [guide] = await check<
          { status: string; pre_shipment_number: string | null }[]
        >`
          SELECT status, pre_shipment_number FROM shipping_guide_jobs
          WHERE id = ${job.id}
        `;
        expect(guide).toEqual({
          status: 'uncertain',
          pre_shipment_number: 'PRE-RECOVER-1',
        });
        const [event] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id}
        `;
        expect(event?.count).toBe(0);
      } finally {
        await check.end({ timeout: 5 });
      }

      const removeTrigger = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await removeTrigger.unsafe(
          'DROP TRIGGER IF EXISTS reject_guide_event_insert ON whatsapp_conversation_messages',
        );
        await removeTrigger.unsafe(
          'DROP FUNCTION IF EXISTS reject_guide_event_insert()',
        );
      } finally {
        await removeTrigger.end({ timeout: 5 });
      }

      await expect(
        repository.reviewUncertain(job.id, 'PRE-RECOVER-1'),
      ).resolves.toBe(true);
      await expect(
        repository.reviewUncertain(job.id, 'PRE-RECOVER-1'),
      ).resolves.toBe(false);

      const verification = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [event] = await verification<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${job.id} AND conversation_id = ${conversationId}
            AND source = 'system' AND message_type = 'event' AND status = 'internal'
        `;
        expect(event?.count).toBe(1);
        expect(client.createPreShipment).toHaveBeenCalledTimes(1);
      } finally {
        await verification.end({ timeout: 5 });
      }
    } finally {
      await database.close();
      const cleanup = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await cleanup.unsafe(
          'DROP TRIGGER IF EXISTS reject_guide_event_insert ON whatsapp_conversation_messages',
        );
        await cleanup.unsafe(
          'DROP FUNCTION IF EXISTS reject_guide_event_insert()',
        );
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    }
  });

  it('creates no conversation event for a guide from a panel order', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresShippingGuideJobRepository(database);
      const job = await repository.enqueue(
        '11111111-1111-4111-8111-111111111111',
      );
      await repository.claimNext();
      await repository.markCreated(job.id, 'PRE-PANEL', 11900);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE source = 'system'
        `;
        expect(row?.count).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
