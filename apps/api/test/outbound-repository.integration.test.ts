import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
