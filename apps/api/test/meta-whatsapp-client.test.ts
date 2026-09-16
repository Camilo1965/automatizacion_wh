import { describe, expect, it, vi } from 'vitest';

import { MetaWhatsAppClient } from '../src/modules/whatsapp/meta-whatsapp-client.js';

describe('MetaWhatsAppClient', () => {
  it('uploads a PDF and accepts the documented Meta identity envelope', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'pdf-media' }))
      .mockResolvedValueOnce(
        Response.json({
          messaging_product: 'whatsapp',
          contacts: [{ wa_id: '573001234567' }],
          messages: [{ id: 'wamid.pdf' }],
        }),
      );
    const client = new MetaWhatsAppClient({
      accessToken: 'fixture-only',
      phoneNumberId: '123',
      graphApiVersion: 'v26.0',
      fetch: request,
    });
    await expect(
      client.sendDocument(
        '+573001234567',
        new TextEncoder().encode('%PDF-1.4'),
        'guia.pdf',
        'Tu guía',
      ),
    ).resolves.toEqual({ whatsappMessageId: 'wamid.pdf' });
    const form = request.mock.calls[0]![1].body as FormData;
    expect((form.get('file') as File).type).toBe('application/pdf');
    expect(JSON.parse(request.mock.calls[1]![1].body)).toMatchObject({
      type: 'document',
      to: '573001234567',
      document: { id: 'pdf-media', filename: 'guia.pdf' },
    });
    expect(
      request.mock.calls.every((call) => call[1].signal instanceof AbortSignal),
    ).toBe(true);
  });
  it('sends a text message with the configured Cloud API identity', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.out-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new MetaWhatsAppClient({
      accessToken: 'test-access-token',
      phoneNumberId: '123456',
      graphApiVersion: 'v26.0',
      fetch: request,
    });

    await expect(
      client.sendText('+573001234567', '¿Qué talla buscas?'),
    ).resolves.toEqual({
      whatsappMessageId: 'wamid.out-1',
    });
    expect(request).toHaveBeenCalledWith(
      'https://graph.facebook.com/v26.0/123456/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '573001234567',
      type: 'text',
      text: { preview_url: false, body: '¿Qué talla buscas?' },
    });
  });

  it('reports a stable error without exposing Meta response bodies', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response('secret detail', { status: 401 }));
    const client = new MetaWhatsAppClient({
      accessToken: 'test-access-token',
      phoneNumberId: '123456',
      graphApiVersion: 'v26.0',
      fetch: request,
    });
    await expect(client.sendText('+573001234567', 'Hola')).rejects.toThrow(
      'WhatsApp text send failed with status 401',
    );
  });

  it('uploads local image bytes and sends the returned media id', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'media-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.image-1' }] }), {
          status: 200,
        }),
      );
    const client = new MetaWhatsAppClient({
      accessToken: 'test-access-token',
      phoneNumberId: '123456',
      graphApiVersion: 'v26.0',
      fetch: request,
    });

    await expect(
      client.sendImage(
        '+573001234567',
        new Uint8Array([0xff, 0xd8, 0xff]),
        'image/jpeg',
        'REF 01 · Talla 37',
      ),
    ).resolves.toEqual({ whatsappMessageId: 'wamid.image-1' });

    expect(request.mock.calls[0]?.[0]).toBe(
      'https://graph.facebook.com/v26.0/123456/media',
    );
    const upload = request.mock.calls[0]?.[1];
    expect(upload?.body).toBeInstanceOf(FormData);
    const form = upload?.body as FormData;
    expect(form.get('messaging_product')).toBe('whatsapp');
    expect(form.get('type')).toBe('image/jpeg');
    expect(form.get('file')).toBeInstanceOf(Blob);

    const sendBody = JSON.parse(request.mock.calls[1]?.[1]?.body as string);
    expect(sendBody).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '573001234567',
      type: 'image',
      image: { id: 'media-1', caption: 'REF 01 · Talla 37' },
    });
  });
});
