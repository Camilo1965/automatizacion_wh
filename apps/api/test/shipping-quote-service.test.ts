import { describe, expect, it, vi } from 'vitest';

import { ShippingQuoteService } from '../src/modules/shipping/shipping-quote-service.js';

describe('ShippingQuoteService', () => {
  it('persists all quotes and recommends the municipality carrier', async () => {
    const quotes = [
      {
        carrier: 'envia',
        freightCop: 10_000,
        cashOnDeliveryCop: 2_000,
        surchargeCop: 0,
        serviceId: 1,
        estimatedDays: '1',
      },
      {
        carrier: 'tcc',
        freightCop: 15_000,
        cashOnDeliveryCop: 3_000,
        surchargeCop: 0,
        serviceId: 2,
        estimatedDays: '2',
      },
    ];
    const repository = {
      preferredCarrier: vi.fn().mockResolvedValue('tcc'),
      replaceQuotes: vi.fn().mockImplementation(async (input) => input.quotes),
      selectQuote: vi.fn(),
      getShipping: vi.fn(),
      upsertCarrierRule: vi.fn(),
    };
    const client = { quote: vi.fn().mockResolvedValue(quotes) };
    const orders = {
      get: vi.fn().mockResolvedValue({
        id: 'order-1',
        status: 'draft',
        draftVersion: 3,
        unitPriceCop: 120_000,
        quantity: 1,
        destination: { localityCarrierCode: '05001000' },
      }),
    };
    const now = new Date('2026-09-07T17:00:00.000Z');
    const service = new ShippingQuoteService(
      repository,
      orders,
      client,
      () => now,
    );

    await service.createQuotes('order-1');

    expect(repository.replaceQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        draftVersion: 3,
        recommendedCarrier: 'tcc',
        quotedAt: now,
        expiresAt: new Date('2026-09-07T17:30:00.000Z'),
        quotes,
      }),
    );
  });

  it('rejects an order without an eight-digit DANE destination', async () => {
    const service = new ShippingQuoteService(
      {
        preferredCarrier: vi.fn(),
        replaceQuotes: vi.fn(),
        selectQuote: vi.fn(),
        getShipping: vi.fn(),
        upsertCarrierRule: vi.fn(),
      },
      {
        get: vi.fn().mockResolvedValue({
          id: 'o',
          status: 'draft',
          draftVersion: 1,
          unitPriceCop: 1,
          quantity: 1,
          destination: { localityCarrierCode: '5001' },
        }),
      },
      { quote: vi.fn() },
    );
    await expect(service.createQuotes('o')).rejects.toMatchObject({
      code: 'invalid_shipping_locality',
    });
  });
});
