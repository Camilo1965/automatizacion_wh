import { describe, expect, it, vi } from 'vitest';

import type { PostgresDatabase } from '../src/database/client.js';
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
  last_inbound_message_at: Date;
  send_guide_to_customer?: boolean;
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
    last_inbound_message_at: new Date(),
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

  it('does not enqueue a customer guide document after the 24-hour service window closes', async () => {
    const { database } = fakeDatabase(
      candidate({ last_inbound_message_at: new Date(0) }),
      {
        guidePdfStorageKey: 'guides/order.pdf',
        guidePdfSha256: 'abc123',
      },
    );
    const fetchPdf = vi.fn();
    const enqueueDocument = vi.fn();

    await expect(
      new GuideDeliveryService(
        database,
        guides(fetchPdf),
        outbound(enqueueDocument),
      ).runOnce(),
    ).resolves.toBe(false);
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(enqueueDocument).not.toHaveBeenCalled();
  });

  it('never sends a guide to the customer for a legacy flow snapshot that opted in', async () => {
    const { database, orm } = fakeDatabase(
      candidate({ send_guide_to_customer: true }),
      {
        guidePdfStorageKey: 'guides/order.pdf',
        guidePdfSha256: 'abc123',
      },
    );
    const fetchPdf = vi.fn();
    const enqueueDocument = vi.fn();

    await expect(
      new GuideDeliveryService(
        database,
        guides(fetchPdf),
        outbound(enqueueDocument),
      ).runOnce(),
    ).resolves.toBe(false);
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(enqueueDocument).not.toHaveBeenCalled();
    expect(orm.update).not.toHaveBeenCalled();
  });
});
