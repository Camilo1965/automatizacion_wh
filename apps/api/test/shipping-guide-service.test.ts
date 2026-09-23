import { describe, expect, it, vi } from 'vitest';

import { ShippingGuideService } from '../src/modules/shipping/shipping-guide-service.js';

describe('ShippingGuideService', () => {
  it('reuses a stored PDF and never asks the provider again', async () => {
    const bytes = new TextEncoder().encode('%PDF-existing');
    const repository = {
      findByOrderId: vi.fn().mockResolvedValue({
        id: 'job-1',
        status: 'created',
        carrier: 'envia',
        preShipmentNumber: '123',
        guidePdfStorageKey: 'stored.pdf',
      }),
      attachPdf: vi.fn(),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      read: vi.fn().mockResolvedValue(bytes),
      save: vi.fn(),
      delete: vi.fn(),
    };
    const client = { getGuidePdf: vi.fn() };
    const service = new ShippingGuideService(repository, client, storage);

    await expect(service.fetchPdf('order-1')).resolves.toEqual({
      bytes,
      sha256: null,
    });
    expect(client.getGuidePdf).not.toHaveBeenCalled();
  });

  it('downloads, validates, stores and attaches a created guide PDF', async () => {
    const bytes = new TextEncoder().encode('%PDF-provider');
    const repository = {
      findByOrderId: vi.fn().mockResolvedValue({
        id: 'job-1',
        status: 'created',
        carrier: 'envia',
        preShipmentNumber: '123',
        guidePdfStorageKey: null,
      }),
      attachPdf: vi.fn().mockResolvedValue(true),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      read: vi.fn(),
      save: vi.fn().mockResolvedValue({
        storageKey: 'generated.pdf',
        sha256: 'a'.repeat(64),
        byteSize: bytes.byteLength,
      }),
      delete: vi.fn(),
    };
    const client = { getGuidePdf: vi.fn().mockResolvedValue(bytes) };
    const service = new ShippingGuideService(repository, client, storage);

    await expect(service.fetchPdf('order-1')).resolves.toEqual({
      bytes,
      sha256: 'a'.repeat(64),
    });
    expect(client.getGuidePdf).toHaveBeenCalledWith('123', 'envia');
    expect(repository.attachPdf).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ storageKey: 'generated.pdf' }),
    );
  });

  it('keeps a PDF whose key was committed before attachPdf threw', async () => {
    const bytes = new TextEncoder().encode('%PDF-provider');
    const attachError = new Error('database connection lost after commit');
    const repository = {
      findByOrderId: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: 'generated.pdf',
          guidePdfSha256: 'a'.repeat(64),
        }),
      attachPdf: vi.fn().mockRejectedValue(attachError),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      read: vi.fn().mockResolvedValue(bytes),
      save: vi.fn().mockResolvedValue({
        storageKey: 'generated.pdf',
        sha256: 'a'.repeat(64),
        byteSize: bytes.byteLength,
      }),
      delete: vi.fn(),
    };
    const service = new ShippingGuideService(
      repository,
      { getGuidePdf: vi.fn().mockResolvedValue(bytes) },
      storage,
    );

    await expect(service.fetchPdf('order-1')).resolves.toEqual({
      bytes,
      sha256: 'a'.repeat(64),
    });
    expect(repository.findByOrderId).toHaveBeenCalledTimes(2);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes a PDF and rethrows when a failed attach left no reference', async () => {
    const bytes = new TextEncoder().encode('%PDF-provider');
    const attachError = new Error('database write failed');
    const repository = {
      findByOrderId: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        }),
      attachPdf: vi.fn().mockRejectedValue(attachError),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      read: vi.fn(),
      save: vi
        .fn()
        .mockResolvedValue({
          storageKey: 'generated.pdf',
          sha256: null,
          byteSize: bytes.byteLength,
        }),
      delete: vi.fn(),
    };
    const service = new ShippingGuideService(
      repository,
      { getGuidePdf: vi.fn().mockResolvedValue(bytes) },
      storage,
    );

    await expect(service.fetchPdf('order-1')).rejects.toBe(attachError);
    expect(storage.delete).toHaveBeenCalledWith('generated.pdf');
  });

  it('preserves a PDF when the reference lookup fails after an attach error', async () => {
    const bytes = new TextEncoder().encode('%PDF-provider');
    const attachError = new Error('database write timed out');
    const repository = {
      findByOrderId: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        })
        .mockRejectedValueOnce(new Error('database unavailable')),
      attachPdf: vi.fn().mockRejectedValue(attachError),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      read: vi.fn(),
      save: vi
        .fn()
        .mockResolvedValue({
          storageKey: 'generated.pdf',
          sha256: null,
          byteSize: bytes.byteLength,
        }),
      delete: vi.fn(),
    };
    const service = new ShippingGuideService(
      repository,
      { getGuidePdf: vi.fn().mockResolvedValue(bytes) },
      storage,
    );

    await expect(service.fetchPdf('order-1')).rejects.toBe(attachError);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('uses a different stored winner after an attach error', async () => {
    const downloaded = new TextEncoder().encode('%PDF-downloaded');
    const winner = new TextEncoder().encode('%PDF-winner');
    const repository = {
      findByOrderId: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: 'winner.pdf',
          guidePdfSha256: 'b'.repeat(64),
        }),
      attachPdf: vi.fn().mockRejectedValue(new Error('database timed out')),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      save: vi.fn().mockResolvedValue({
        storageKey: 'loser.pdf',
        sha256: 'a'.repeat(64),
        byteSize: downloaded.byteLength,
      }),
      read: vi.fn().mockResolvedValue(winner),
      delete: vi.fn(),
    };
    const service = new ShippingGuideService(
      repository,
      { getGuidePdf: vi.fn().mockResolvedValue(downloaded) },
      storage,
    );

    await expect(service.fetchPdf('order-1')).resolves.toEqual({
      bytes: winner,
      sha256: 'b'.repeat(64),
    });
    expect(storage.delete).toHaveBeenCalledWith('loser.pdf');
  });

  it('does not fetch PDFs for uncertain guides', async () => {
    const repository = {
      findByOrderId: vi.fn().mockResolvedValue({
        id: 'job-1',
        status: 'uncertain',
        carrier: 'envia',
        preShipmentNumber: null,
        guidePdfStorageKey: null,
      }),
      attachPdf: vi.fn(),
      reviewUncertain: vi.fn(),
    };
    const client = { getGuidePdf: vi.fn() };
    const storage = { read: vi.fn(), save: vi.fn(), delete: vi.fn() };
    const service = new ShippingGuideService(repository, client, storage);

    await expect(service.fetchPdf('order-1')).rejects.toMatchObject({
      code: 'guide_not_created',
    });
    expect(client.getGuidePdf).not.toHaveBeenCalled();
  });

  it('uses the winning stored file when concurrent PDF requests race', async () => {
    const downloaded = new TextEncoder().encode('%PDF-downloaded');
    const winner = new TextEncoder().encode('%PDF-winner');
    const repository = {
      findByOrderId: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          status: 'created',
          carrier: 'envia',
          preShipmentNumber: '123',
          guidePdfStorageKey: 'winner.pdf',
          guidePdfSha256: 'b'.repeat(64),
        }),
      attachPdf: vi.fn().mockResolvedValue(false),
      reviewUncertain: vi.fn(),
    };
    const storage = {
      save: vi.fn().mockResolvedValue({
        storageKey: 'loser.pdf',
        sha256: 'a'.repeat(64),
        byteSize: downloaded.byteLength,
      }),
      read: vi.fn().mockResolvedValue(winner),
      delete: vi.fn(),
    };
    const service = new ShippingGuideService(
      repository,
      { getGuidePdf: vi.fn().mockResolvedValue(downloaded) },
      storage,
    );

    await expect(service.fetchPdf('order-1')).resolves.toEqual({
      bytes: winner,
      sha256: 'b'.repeat(64),
    });
    expect(storage.delete).toHaveBeenCalledWith('loser.pdf');
  });
});
