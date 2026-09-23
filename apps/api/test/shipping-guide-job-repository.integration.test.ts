import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
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
      await repository.markUncertain(first.id);
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
      await repository.markUncertain(job.id);
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
