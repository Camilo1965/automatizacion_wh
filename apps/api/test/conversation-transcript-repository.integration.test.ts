import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
});
