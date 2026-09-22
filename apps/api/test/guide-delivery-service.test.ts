import { describe, expect, it, vi } from 'vitest';

import type { PostgresDatabase } from '../src/database/client.js';
import type { AlertService } from '../src/modules/alerts/alert-service.js';
import { GuideDeliveryService } from '../src/modules/shipping/guide-delivery-service.js';
import type { ShippingGuideOperations } from '../src/modules/shipping/shipping-guide-service.js';
import type { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';

type Candidate = {
  id: string;
  order_id: string;
  conversation_id: string;
  customer_phone: string;
  caption: string | null;
  carrier: string;
  confirmed_total_cop: number | null;
  size: string;
  customer_name: string | null;
  order_number: number;
  code: string;
};

function fakeDatabase(candidate: Candidate | undefined, job: object = {}) {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const orm = {
    execute: vi
      .fn()
      .mockResolvedValue(candidate === undefined ? [] : [candidate]),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([job]),
      })),
    })),
  };
  return { database: { orm } as unknown as PostgresDatabase, orm };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    order_id: '22222222-2222-4222-8222-222222222222',
    conversation_id: '33333333-3333-4333-8333-333333333333',
    customer_phone: '+573001112233',
    caption: null,
    carrier: 'envia',
    confirmed_total_cop: null,
    size: '37',
    customer_name: null,
    order_number: 42,
    code: '01',
    ...overrides,
  };
}

function guides(
  fetchPdf = vi
    .fn()
    .mockResolvedValue({ bytes: new Uint8Array(), sha256: 'sha' }),
) {
  return {
    fetchPdf,
    reviewUncertain: vi.fn(),
  } as unknown as ShippingGuideOperations;
}

function outbound(
  enqueueDocument = vi.fn().mockResolvedValue({ id: 'message' }),
) {
  return { enqueueDocument } as unknown as PostgresOutboundRepository;
}

describe('GuideDeliveryService', () => {
  it('returns false when there is no eligible guide', async () => {
    const { database, orm } = fakeDatabase(undefined);
    const fetchPdf = vi.fn();

    await expect(
      new GuideDeliveryService(
        database,
        guides(fetchPdf),
        outbound(),
      ).runOnce(),
    ).resolves.toBe(false);
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(orm.update).not.toHaveBeenCalled();
  });

  it('raises a critical owner alert after the third PDF delivery failure', async () => {
    const { database } = fakeDatabase(candidate(), { pdfDeliveryAttempts: 3 });
    const failure = new Error('provider unavailable');
    const fetchPdf = vi.fn().mockRejectedValue(failure);
    const open = vi.fn().mockResolvedValue(undefined);

    await expect(
      new GuideDeliveryService(database, guides(fetchPdf), outbound(), {
        open,
      } as unknown as AlertService).runOnce(),
    ).rejects.toBe(failure);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'guide_pdf_unavailable',
        severity: 'critical',
        entityId: '11111111-1111-4111-8111-111111111111',
        retrySafe: true,
      }),
    );
  });

  it('does not alert before the final PDF delivery attempt', async () => {
    const { database } = fakeDatabase(candidate(), { pdfDeliveryAttempts: 2 });
    const fetchPdf = vi.fn().mockRejectedValue(new Error('temporary'));
    const open = vi.fn();

    await expect(
      new GuideDeliveryService(database, guides(fetchPdf), outbound(), {
        open,
      } as unknown as AlertService).runOnce(),
    ).rejects.toThrow('temporary');
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses to enqueue a document when persisted PDF metadata is incomplete', async () => {
    const { database } = fakeDatabase(candidate(), {
      guidePdfStorageKey: null,
      guidePdfSha256: 'sha',
    });
    const enqueueDocument = vi.fn();

    await expect(
      new GuideDeliveryService(
        database,
        guides(),
        outbound(enqueueDocument),
      ).runOnce(),
    ).rejects.toThrow('Guide PDF was not stored');
    expect(enqueueDocument).not.toHaveBeenCalled();
  });

  it('enqueues a stored PDF with deterministic fallback caption and idempotency', async () => {
    const { database } = fakeDatabase(candidate(), {
      guidePdfStorageKey: 'guides/order.pdf',
      guidePdfSha256: 'abc123',
    });
    const enqueueDocument = vi.fn().mockResolvedValue({ id: 'message' });

    await expect(
      new GuideDeliveryService(
        database,
        guides(),
        outbound(enqueueDocument),
      ).runOnce(),
    ).resolves.toBe(true);
    expect(enqueueDocument).toHaveBeenCalledWith({
      conversationId: '33333333-3333-4333-8333-333333333333',
      customerPhone: '+573001112233',
      storageKey: 'guides/order.pdf',
      caption:
        'Tu guía de envío está lista. Conserva este documento para consultar tu pedido.',
      idempotencyKey: 'guide:11111111-1111-4111-8111-111111111111:abc123',
    });
  });

  it('renders configured guide variables including formatted totals', async () => {
    const { database } = fakeDatabase(
      candidate({
        caption:
          'Hola {{nombre}}, pedido {{pedido}}, talla {{talla}}, referencia {{referencia}}, {{transportadora}}, total {{total}}',
        customer_name: 'Camila',
        confirmed_total_cop: 120000,
      }),
      { guidePdfStorageKey: 'guides/custom.pdf', guidePdfSha256: 'custom' },
    );
    const enqueueDocument = vi.fn().mockResolvedValue({ id: 'message' });

    await new GuideDeliveryService(
      database,
      guides(),
      outbound(enqueueDocument),
    ).runOnce();

    const payload = enqueueDocument.mock.calls[0]![0] as { caption: string };
    expect(payload.caption).toContain('Camila');
    expect(payload.caption).toContain('PED-000042');
    expect(payload.caption).toContain('120.000');
  });
});
