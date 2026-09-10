import { describe, expect, it } from 'vitest';

import {
  ConversationMessagePublicSchema,
  ConversationMessagesPageSchema,
  ConversationPageSchema,
} from '../src/index.js';

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  source: 'customer',
  messageType: 'text',
  text: 'Hola',
  mediaUrl: null,
  status: 'received',
  providerMessageId: 'wamid.1',
  occurredAt: '2026-09-10T15:00:00.000Z',
};

describe('conversation contracts', () => {
  it('accepts a normalized transcript message and rejects unknown fields', () => {
    expect(ConversationMessagePublicSchema.parse(message)).toEqual(message);
    expect(
      ConversationMessagePublicSchema.safeParse({ ...message, secret: true })
        .success,
    ).toBe(false);
  });

  it('validates cursor-paginated messages', () => {
    expect(
      ConversationMessagesPageSchema.parse({
        items: [message],
        nextCursor: null,
      }),
    ).toEqual({ items: [message], nextCursor: null });
  });

  it('validates conversation summaries used by the inbox', () => {
    const page = {
      items: [
        {
          id: message.conversationId,
          customerName: null,
          customerPhone: '+573001234567',
          lastPreview: 'Hola',
          unreadCount: 1,
          operationalLabel: 'new',
          controlOwner: 'bot',
          activeOrderId: null,
          lastMessageAt: message.occurredAt,
          updatedAt: message.occurredAt,
        },
      ],
      nextCursor: null,
    };
    expect(ConversationPageSchema.parse(page)).toEqual(page);
  });
});
