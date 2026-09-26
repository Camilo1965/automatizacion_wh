import { describe, expect, it, vi } from 'vitest';

import { OutboxWorker } from '../src/modules/whatsapp/outbox-worker.js';

describe('OutboxWorker', () => {
  it('opens a safe retry alert when a WhatsApp send fails', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'msg-1',
        customerPhone: '573001234567',
        messageType: 'text',
        textBody: 'Hola',
      }),
      markSent: vi.fn(),
      markFailed: vi.fn(),
      authorizeDocumentSend: vi.fn().mockResolvedValue(true),
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
        retrySafe: false,
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
      authorizeDocumentSend: vi.fn().mockResolvedValue(true),
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
      authorizeDocumentSend: vi.fn().mockResolvedValue(true),
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
      authorizeDocumentSend: vi.fn().mockResolvedValue(true),
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

  it('does not read a guide document if its conversation window is already closed', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'guide-message',
        customerPhone: '+573001234567',
        messageType: 'document' as const,
        textBody: 'Guía lista',
        mediaStorageKey: 'guides/order.pdf',
        mediaMimeType: 'application/pdf' as const,
      }),
      authorizeDocumentSend: vi.fn().mockResolvedValue(false),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const client = {
      sendText: vi.fn(),
      sendImage: vi.fn(),
      sendDocument: vi.fn(),
    };
    const storage = { read: vi.fn() };

    await expect(
      new OutboxWorker(
        repository,
        client,
        undefined,
        undefined,
        storage,
      ).runOnce(),
    ).resolves.toBe(true);

    expect(repository.authorizeDocumentSend).toHaveBeenCalledWith(
      'guide-message',
    );
    expect(storage.read).not.toHaveBeenCalled();
    expect(client.sendDocument).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('does not send or retry a guide document if its window closes during storage read', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'guide-message',
        customerPhone: '+573001234567',
        messageType: 'document' as const,
        textBody: 'Guía lista',
        mediaStorageKey: 'guides/order.pdf',
        mediaMimeType: 'application/pdf' as const,
      }),
      authorizeDocumentSend: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const client = {
      sendText: vi.fn(),
      sendImage: vi.fn(),
      sendDocument: vi.fn(),
    };
    const storage = {
      read: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };

    await expect(
      new OutboxWorker(
        repository,
        client,
        undefined,
        undefined,
        storage,
      ).runOnce(),
    ).resolves.toBe(true);

    expect(repository.authorizeDocumentSend).toHaveBeenCalledTimes(2);
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(
      repository.authorizeDocumentSend.mock.invocationCallOrder[0],
    ).toBeLessThan(storage.read.mock.invocationCallOrder[0]!);
    expect(storage.read.mock.invocationCallOrder[0]).toBeLessThan(
      repository.authorizeDocumentSend.mock.invocationCallOrder[1]!,
    );
    expect(client.sendDocument).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('sends a guide document when its conversation window is still open', async () => {
    const repository = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'guide-message',
        customerPhone: '+573001234567',
        messageType: 'document' as const,
        textBody: 'Guía lista',
        mediaStorageKey: 'guides/order.pdf',
        mediaMimeType: 'application/pdf' as const,
      }),
      authorizeDocumentSend: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn(),
    };
    const client = {
      sendText: vi.fn(),
      sendImage: vi.fn(),
      sendDocument: vi.fn().mockResolvedValue({
        whatsappMessageId: 'wamid.guide-1',
      }),
    };
    const storage = {
      read: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };

    await expect(
      new OutboxWorker(
        repository,
        client,
        undefined,
        undefined,
        storage,
      ).runOnce(),
    ).resolves.toBe(true);

    expect(repository.authorizeDocumentSend).toHaveBeenCalledTimes(2);
    expect(
      repository.authorizeDocumentSend.mock.invocationCallOrder[0],
    ).toBeLessThan(storage.read.mock.invocationCallOrder[0]!);
    expect(storage.read.mock.invocationCallOrder[0]).toBeLessThan(
      repository.authorizeDocumentSend.mock.invocationCallOrder[1]!,
    );
    expect(
      repository.authorizeDocumentSend.mock.invocationCallOrder[1],
    ).toBeLessThan(client.sendDocument.mock.invocationCallOrder[0]!);
    expect(storage.read).toHaveBeenCalledWith('guides/order.pdf');
    expect(client.sendDocument).toHaveBeenCalledWith(
      '+573001234567',
      new Uint8Array([37, 80, 68, 70]),
      'guia-de-envio.pdf',
      'Guía lista',
    );
    expect(repository.markSent).toHaveBeenCalledWith(
      'guide-message',
      'wamid.guide-1',
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });
});
