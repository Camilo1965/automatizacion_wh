import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationAdminRepository } from '../src/modules/conversations/postgres-conversation-admin-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('conversation owner control', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_conversation_events, whatsapp_conversations CASCADE`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('exposes only a resolved customer ID alongside the existing conversation fields', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const phone = `+573${Math.floor(Math.random() * 1_000_000_000)
      .toString()
      .padStart(9, '0')}`;
    const [customer] = await sql<{ id: string }[]>`
      INSERT INTO customers (normalized_phone, display_name)
      VALUES (${phone}, 'Ana Gómez') RETURNING id
    `;
    const [linked] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations (customer_phone, customer_id, state, mode, last_inbound_message_at)
      VALUES (${phone}, ${customer!.id}, 'awaiting_size', 'bot', now()) RETURNING id
    `;
    const [unlinked] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations (customer_phone, state, mode, last_inbound_message_at)
      VALUES ('+573001234568', 'awaiting_size', 'bot', now()) RETURNING id
    `;
    await sql.end({ timeout: 5 });
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationAdminRepository(database);
    try {
      const linkedResult = await repository.get(linked!.id);
      const unlinkedResult = await repository.get(unlinked!.id);
      expect(linkedResult?.customerId).toBe(customer!.id);
      expect(unlinkedResult?.customerId).toBeNull();
      expect(linkedResult).not.toHaveProperty('displayName');
      expect(linkedResult).not.toHaveProperty('marketingConsent');
      const page = await repository.list();
      expect(
        page.items.find((item) => item.id === linked!.id)?.customerId,
      ).toBe(customer!.id);
    } finally {
      await database.close();
      const cleanup = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await cleanup`DELETE FROM whatsapp_conversations WHERE id IN (${linked!.id}, ${unlinked!.id})`;
        await cleanup`DELETE FROM customers WHERE id = ${customer!.id}`;
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    }
  });

  it('takes control atomically and cancels pending bot sends', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const [conversation] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations
        (customer_phone, state, mode, last_inbound_message_at)
      VALUES ('+573001234567', 'awaiting_size', 'bot', now())
      RETURNING id
    `;
    await sql`
      INSERT INTO whatsapp_outbound_messages
        (conversation_id, idempotency_key, customer_phone, message_type, text_body)
      VALUES (${conversation!.id}, 'pending:one', '+573001234567', 'text', 'Hola')
    `;
    await sql.end({ timeout: 5 });
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationAdminRepository(database);
    try {
      await repository.takeControl(conversation!.id);
      await expect(repository.get(conversation!.id)).resolves.toMatchObject({
        mode: 'human',
        pendingOutbound: 0,
      });
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [job] = await check<{ status: string }[]>`
          SELECT status FROM whatsapp_outbound_messages
        `;
        expect(job?.status).toBe('cancelled');
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('releases control without creating a new bot message', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const [conversation] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations
        (customer_phone, state, mode, last_inbound_message_at)
      VALUES ('+573008888888', 'awaiting_size', 'human', now())
      RETURNING id
    `;
    await sql.end({ timeout: 5 });
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationAdminRepository(database);
    try {
      await repository.releaseControl(conversation!.id);
      await expect(repository.get(conversation!.id)).resolves.toMatchObject({
        mode: 'bot',
        pendingOutbound: 0,
      });
    } finally {
      await database.close();
    }
  });
});
