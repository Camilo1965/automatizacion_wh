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

const guideEvent = {
  id: '33333333-3333-4333-8333-333333333333',
  conversationId: '22222222-2222-4222-8222-222222222222',
  source: 'system',
  messageType: 'event',
  text: null,
  mediaUrl: null,
  status: 'internal',
  providerMessageId: null,
  occurredAt: '2026-09-10T15:00:00.000Z',
  orderId: '44444444-4444-4444-8444-444444444444',
  orderNumber: 'PED-000123',
  guideJobId: '55555555-5555-4555-8555-555555555555',
  preShipmentNumber: 'PRE-12345',
  carrier: 'envia',
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

  it('accepts a strict internal guide event with no WhatsApp delivery fields', () => {
    expect(ConversationMessagePublicSchema.parse(guideEvent)).toEqual(
      guideEvent,
    );
  });

  it.each([
    ['missing orderId', { ...guideEvent, orderId: undefined }],
    ['invalid guideJobId', { ...guideEvent, guideJobId: 'not-a-uuid' }],
    ['missing pre-shipment number', { ...guideEvent, preShipmentNumber: '' }],
    ['missing carrier', { ...guideEvent, carrier: undefined }],
    [
      'provider message id is not null',
      { ...guideEvent, providerMessageId: 'wamid.1' },
    ],
    ['media URL is not null', { ...guideEvent, mediaUrl: '/guide.pdf' }],
    ['internal event has a delivery status', { ...guideEvent, status: 'sent' }],
    [
      'unknown internal field',
      { ...guideEvent, storageKey: 'private/path.pdf' },
    ],
  ])('rejects a malformed internal guide event: %s', (_name, candidate) => {
    expect(ConversationMessagePublicSchema.safeParse(candidate).success).toBe(
      false,
    );
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
