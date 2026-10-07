import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('WhatsApp outbound repository', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_conversation_events, whatsapp_conversations CASCADE`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('enqueues one message for a repeated idempotency key', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOutboundRepository(database);
    try {
      const first = await repository.enqueueText({
        customerPhone: '+573001234567',
        body: 'Bienvenida',
        idempotencyKey: 'welcome:wamid.1',
      });
      const replay = await repository.enqueueText({
        customerPhone: '+573001234567',
        body: 'Bienvenida',
        idempotencyKey: 'welcome:wamid.1',
      });
      expect(replay.id).toBe(first.id);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await sql<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM whatsapp_outbound_messages`;
        expect(row?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('allows only one worker to claim a pending message', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOutboundRepository(database);
    try {
      await repository.enqueueText({
        customerPhone: '+573001234567',
        body: 'Bienvenida',
        idempotencyKey: 'claim:wamid.1',
      });
      const claims = await Promise.all([
        repository.claimNext(),
        repository.claimNext(),
      ]);
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      expect(claims.find((claim) => claim !== null)).toMatchObject({
        customerPhone: '+573001234567',
        textBody: 'Bienvenida',
      });
    } finally {
      await database.close();
    }
  });

  it('cancels a pending bot message when its conversation is in human mode', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const [conversation] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations
        (customer_phone, state, mode, last_inbound_message_at)
      VALUES ('+573008888888', 'awaiting_size', 'human', now())
      RETURNING id
    `;
    await sql.end({ timeout: 5 });
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOutboundRepository(database);
    try {
      await repository.enqueueText({
        conversationId: conversation!.id,
        customerPhone: '+573008888888',
        body: 'No debe salir',
        idempotencyKey: 'human:wamid.1',
      });
      await expect(repository.claimNext()).resolves.toBeNull();
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await check<{ status: string }[]>`
          SELECT status FROM whatsapp_outbound_messages
        `;
        expect(row?.status).toBe('cancelled');
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('cancels a guide document enqueued in-window when claimed after the window closes and preserves the guide event', async () => {
    const conversationId = randomUUID();
    const orderId = randomUUID();
    const referenceId = randomUUID();
    const guideId = randomUUID();
    const referenceCode = `OUTBOX-${randomUUID().slice(0, 8).toUpperCase()}`;
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO whatsapp_conversations
          (id, customer_phone, state, mode, last_inbound_message_at)
        VALUES (${conversationId}, '+573007777777', 'complete', 'bot', now())
      `;
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${referenceCode}, 'Tenis', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (id, reference_id, size, quantity, status)
        VALUES (${orderId}, ${referenceId}, 37, 1, 'confirmed')
      `;
      await sql`
        INSERT INTO shipping_guide_jobs
          (id, order_id, status, carrier, pre_shipment_number)
        VALUES (${guideId}, ${orderId}, 'created', 'envia', 'PRE-WINDOW-1')
      `;
      await sql`
        INSERT INTO whatsapp_conversation_messages
          (conversation_id, source, message_type, status, occurred_at,
           guide_job_id, guide_order_id)
        VALUES (${conversationId}, 'system', 'event', 'internal', now(), ${guideId}, ${orderId})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOutboundRepository(database);
    try {
      const queued = await repository.enqueueDocument({
        conversationId,
        customerPhone: '+573007777777',
        storageKey: 'guides/window.pdf',
        caption: 'Guía lista',
        idempotencyKey: 'guide:window:sha',
      });
      expect(queued).not.toBeNull();

      const expireWindow = postgres(databaseUrl, { max: 1, prepare: false });
      await expireWindow`
        UPDATE whatsapp_conversations
        SET last_inbound_message_at = now() - INTERVAL '24 hours 1 second'
        WHERE id = ${conversationId}
      `;
      await expireWindow.end({ timeout: 5 });

      await expect(repository.claimNext()).resolves.toBeNull();
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [outbound] = await check<
          { status: string; error_code: string }[]
        >`
          SELECT status, error_code FROM whatsapp_outbound_messages
          WHERE idempotency_key = 'guide:window:sha'
        `;
        const [transcript] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE outbound_message_id = ${queued!.id} AND status = 'cancelled'
        `;
        const [guideEvent] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_conversation_messages
          WHERE guide_job_id = ${guideId} AND status = 'internal'
        `;

        expect(outbound).toEqual({
          status: 'cancelled',
          error_code: 'service_window_closed',
        });
        expect(transcript?.count).toBe(1);
        expect(guideEvent?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('enqueues and claims an image with its caption and storage metadata', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOutboundRepository(database);
    try {
      await repository.enqueueImage({
        customerPhone: '+573001234567',
        caption: 'REF 01',
        storageKey: 'catalog/01.jpg',
        mimeType: 'image/jpeg',
        idempotencyKey: 'image:wamid.1:01',
      });
      await expect(repository.claimNext()).resolves.toMatchObject({
        messageType: 'image',
        textBody: 'REF 01',
        mediaStorageKey: 'catalog/01.jpg',
        mediaMimeType: 'image/jpeg',
      });
    } finally {
      await database.close();
    }
  });
});
