import { describe, expect, it, vi } from 'vitest';

import type { PostgresDatabase } from '../src/database/client.js';
import { PostgresConversationTranscriptRepository } from '../src/modules/conversations/postgres-conversation-transcript-repository.js';

describe('PostgresConversationTranscriptRepository lifecycle events', () => {
  it('maps persisted order transitions into internal conversation timeline events', async () => {
    const occurredAt = new Date('2026-09-25T12:30:00.000Z');
    const database = {
      orm: {
        execute: vi.fn().mockResolvedValue([
          {
            id: '44444444-4444-4444-8444-444444444444',
            conversation_id: '11111111-1111-4111-8111-111111111111',
            source: 'system',
            message_type: 'event',
            text_body: null,
            status: 'internal',
            provider_message_id: null,
            occurred_at: occurredAt,
            cursor_occurred_at: '2026-09-25T12:30:00.000000Z',
            guide_order_id: '22222222-2222-4222-8222-222222222222',
            order_number: '123',
            guide_job_id: null,
            pre_shipment_number: null,
            carrier: null,
            order_status: 'dispatched',
          },
        ]),
      },
    } as unknown as PostgresDatabase;

    const page = await new PostgresConversationTranscriptRepository(
      database,
    ).listMessages('11111111-1111-4111-8111-111111111111');

    expect(page.items).toEqual([
      {
        id: '44444444-4444-4444-8444-444444444444',
        conversationId: '11111111-1111-4111-8111-111111111111',
        source: 'system',
        eventType: 'order_status',
        messageType: 'event',
        text: null,
        mediaUrl: null,
        status: 'internal',
        providerMessageId: null,
        occurredAt,
        orderId: '22222222-2222-4222-8222-222222222222',
        orderNumber: 'PED-000123',
        orderStatus: 'dispatched',
      },
    ]);
  });
});
