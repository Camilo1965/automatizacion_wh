import { describe, expect, it, vi } from 'vitest';

import { OutboxWorker } from '../src/modules/whatsapp/outbox-worker.js';

describe('OutboxWorker', () => {
  it('opens a safe retry alert when a WhatsApp send fails', async () => {
    const repository = {
      claimNext: vi
        .fn()
        .mockResolvedValue({
          id: 'msg-1',
          customerPhone: '573001234567',
          messageType: 'text',
          textBody: 'Hola',
        }),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const incidents = { open: vi.fn() };
    await new OutboxWorker(
      repository,
      {
        sendText: vi.fn().mockRejectedValue(new Error('Meta unavailable')),
        sendImage: vi.fn(),
      },
      undefined,
      incidents,
    ).runOnce();
    expect(incidents.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'whatsapp_send_failed',
        entityId: 'msg-1',
        retrySafe: true,
      }),
    );
  });
  it('marks a claimed text message as sent with Meta id', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        customerPhone: '+573001234567',
        messageType: 'text' as const,
        textBody: 'Hola',
      }),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      sendText: vi.fn().mockResolvedValue({ whatsappMessageId: 'wamid.sent' }),
      sendImage: vi.fn(),
    };
    const worker = new OutboxWorker(repository, client);
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(client.sendText).toHaveBeenCalledWith('+573001234567', 'Hola');
    expect(repository.markSent).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'wamid.sent',
    );
  });

  it('returns false when no send is claimable', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue(null),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const client = { sendText: vi.fn(), sendImage: vi.fn() };
    await expect(new OutboxWorker(repository, client).runOnce()).resolves.toBe(
      false,
    );
  });

  it('reads and sends image bytes without exposing a local path', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'out-2',
        customerPhone: '+573001234567',
        messageType: 'image' as const,
        textBody: 'REF 01',
        mediaStorageKey: 'catalog/01.jpg',
        mediaMimeType: 'image/jpeg' as const,
      }),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      sendText: vi.fn(),
      sendImage: vi
        .fn()
        .mockResolvedValue({ whatsappMessageId: 'wamid.image-1' }),
    };
    const photoStorage = {
      read: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    };
    const worker = new OutboxWorker(repository, client, photoStorage);

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(photoStorage.read).toHaveBeenCalledWith('catalog/01.jpg');
    expect(client.sendImage).toHaveBeenCalledWith(
      '+573001234567',
      new Uint8Array([1, 2, 3]),
      'image/jpeg',
      'REF 01',
    );
    expect(repository.markSent).toHaveBeenCalledWith('out-2', 'wamid.image-1');
  });
});
