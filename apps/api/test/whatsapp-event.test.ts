import { describe, expect, it } from 'vitest';

import { extractInboundWhatsAppMessages } from '../src/modules/whatsapp/whatsapp-event.js';

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: '1234567890' },
            messages: [
              {
                from: '573001234567',
                id: 'wamid.test-message-1',
                timestamp: '1760000000',
                type: 'text',
                text: { body: 'Busco talla 37' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('extractInboundWhatsAppMessages', () => {
  it('extracts an inbound text message with normalized phone and timestamp', () => {
    const result = extractInboundWhatsAppMessages(payload);
    expect(result).toMatchObject({
      ok: true,
      messages: [
        {
          whatsappMessageId: 'wamid.test-message-1',
          businessPhoneNumberId: '1234567890',
          customerPhone: '+573001234567',
          messageType: 'text',
          textBody: 'Busco talla 37',
          receivedAt: new Date('2025-10-09T08:53:20.000Z'),
        },
      ],
    });
  });

  it('accepts a valid status-only event without extracting a message', () => {
    expect(
      extractInboundWhatsAppMessages({
        object: 'whatsapp_business_account',
        entry: [],
      }),
    ).toEqual({ ok: true, messages: [] });
  });

  it('rejects malformed event structure', () => {
    expect(extractInboundWhatsAppMessages({ entry: 'invalid' })).toEqual({
      ok: false,
    });
  });

  it.each([
    {
      object: 'whatsapp_business_account',
      entry: 'invalid',
    },
    {
      object: 'whatsapp_business_account',
      entry: [{}],
    },
    {
      object: 'whatsapp_business_account',
      entry: [{ changes: [null] }],
    },
    {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: 'invalid' } }] }],
    },
  ])('rejects a malformed nested payload %#', (malformed) => {
    expect(extractInboundWhatsAppMessages(malformed)).toEqual({ ok: false });
  });

  it('skips status-only changes that omit messages', () => {
    expect(
      extractInboundWhatsAppMessages({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '1234567890' },
                  statuses: [{ id: 'wamid.status-1' }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: true, messages: [] });
  });

  it('rejects messages without metadata phone_number_id', () => {
    expect(
      extractInboundWhatsAppMessages({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {},
                  messages: [
                    {
                      from: '573001234567',
                      id: 'wamid.x',
                      timestamp: '1760000000',
                      type: 'text',
                      text: { body: 'hola' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: false });
  });

  it('rejects invalid customer phone or timestamp', () => {
    expect(
      extractInboundWhatsAppMessages({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '123' },
                  messages: [
                    {
                      from: 'abc',
                      id: 'wamid.x',
                      timestamp: '1760000000',
                      type: 'text',
                      text: { body: 'hola' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: false });

    expect(
      extractInboundWhatsAppMessages({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '123' },
                  messages: [
                    {
                      from: '573001234567',
                      id: 'wamid.x',
                      timestamp: '-1',
                      type: 'image',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: false });
  });

  it('accepts non-text messages with null text body', () => {
    const result = extractInboundWhatsAppMessages({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1234567890' },
                messages: [
                  {
                    from: '573001234567',
                    id: 'wamid.image-1',
                    timestamp: '1760000000',
                    type: 'image',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      messages: [{ messageType: 'image', textBody: null }],
    });
  });
});
