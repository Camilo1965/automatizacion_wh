import { describe, expect, it, vi } from 'vitest';

import { ShippingQuoteService } from '../src/modules/shipping/shipping-quote-service.js';

describe('ShippingQuoteService', () => {
  it('stores only the carrier allowed for a municipality', async () => {
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
      shippingPolicy: vi.fn().mockResolvedValue({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'economy_only',
        protectedInsurance: 'standard',
        allowedCarriers: ['tcc'],
      }),
      replaceQuotes: vi.fn().mockImplementation(async (input) => input.quotes),
      selectQuote: vi.fn(),
      getShipping: vi.fn(),
      upsertCarrierRule: vi.fn(),
      upsertShippingPolicy: vi.fn(),
      defaultShippingPolicy: vi.fn(),
      setDefaultShippingPolicy: vi.fn(),
      listShippingRules: vi.fn(),
      deactivateShippingRule: vi.fn(),
      listObservedCarriers: vi.fn(),
    };
    const service = new ShippingQuoteService(
      repository,
      {
        get: vi.fn().mockResolvedValue({
          id: 'order-1',
          status: 'draft',
          draftVersion: 1,
          unitPriceCop: 120_000,
          quantity: 1,
          destination: { localityCarrierCode: '05001000' },
        }),
      },
      { quote: vi.fn().mockResolvedValue(quotes) },
    );

    const storedOffers = await service.createQuotes('order-1');
    expect(storedOffers.map((offer) => offer.carrier)).toEqual(['tcc']);
  });

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
      shippingPolicy: vi.fn().mockResolvedValue({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'allow',
        offerMode: 'economy_only',
        protectedInsurance: 'standard',
      }),
      replaceQuotes: vi.fn().mockImplementation(async (input) => input.quotes),
      selectQuote: vi.fn(),
      getShipping: vi.fn(),
      upsertCarrierRule: vi.fn(),
      upsertShippingPolicy: vi.fn(),
      defaultShippingPolicy: vi.fn(),
      setDefaultShippingPolicy: vi.fn(),
      listShippingRules: vi.fn(),
      deactivateShippingRule: vi.fn(),
      listObservedCarriers: vi.fn(),
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
        quotes: expect.arrayContaining(
          quotes.map((quote) =>
            expect.objectContaining({ ...quote, insuranceMode: 'none' }),
          ),
        ),
      }),
    );
    expect(client.quote).toHaveBeenCalledWith(
      expect.objectContaining({ insurance: 'none' }),
    );
  });

  it('quotes only Plus insurance and blocks when the required carrier is absent', async () => {
    const repository = {
      preferredCarrier: vi.fn(),
      shippingPolicy: vi.fn().mockResolvedValue({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      }),
      replaceQuotes: vi.fn(),
      selectQuote: vi.fn(),
      getShipping: vi.fn(),
      upsertCarrierRule: vi.fn(),
      upsertShippingPolicy: vi.fn(),
      defaultShippingPolicy: vi.fn(),
      setDefaultShippingPolicy: vi.fn(),
      listShippingRules: vi.fn(),
      deactivateShippingRule: vi.fn(),
      listObservedCarriers: vi.fn(),
    };
    const client = {
      quote: vi.fn().mockResolvedValue([
        {
          carrier: 'envia',
          freightCop: 10,
          cashOnDeliveryCop: 2,
          surchargeCop: 0,
          serviceId: 1,
          estimatedDays: '1',
        },
      ]),
    };
    const service = new ShippingQuoteService(
      repository,
      {
        get: vi.fn().mockResolvedValue({
          id: 'order-1',
          status: 'draft',
          draftVersion: 1,
          unitPriceCop: 120000,
          quantity: 1,
          destination: { localityCarrierCode: '05001000' },
        }),
      },
      client,
    );

    await expect(service.createQuotes('order-1')).rejects.toMatchObject({
      code: 'preferred_carrier_unavailable',
    });
    expect(client.quote).toHaveBeenCalledWith(
      expect.objectContaining({ insurance: 'plus' }),
    );
    expect(repository.replaceQuotes).not.toHaveBeenCalled();
  });

  it('creates separate economy and protected offers for customer choice', async () => {
    const repository = {
      preferredCarrier: vi.fn(),
      shippingPolicy: vi.fn().mockResolvedValue({
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        offerMode: 'customer_choice',
        protectedInsurance: 'standard',
      }),
      replaceQuotes: vi.fn().mockImplementation(async (input) => input.quotes),
      selectQuote: vi.fn(),
      getShipping: vi.fn(),
      upsertCarrierRule: vi.fn(),
      upsertShippingPolicy: vi.fn(),
      defaultShippingPolicy: vi.fn(),
      setDefaultShippingPolicy: vi.fn(),
      listShippingRules: vi.fn(),
      deactivateShippingRule: vi.fn(),
      listObservedCarriers: vi.fn(),
    };
    const client = {
      quote: vi.fn().mockResolvedValue([
        {
          carrier: 'envia',
          freightCop: 10,
          cashOnDeliveryCop: 2,
          surchargeCop: 0,
          serviceId: 1,
          estimatedDays: '1',
        },
      ]),
    };
    const service = new ShippingQuoteService(
      repository,
      {
        get: vi.fn().mockResolvedValue({
          id: 'order-1',
          status: 'draft',
          draftVersion: 1,
          unitPriceCop: 120000,
          quantity: 1,
          destination: { localityCarrierCode: '05001000' },
        }),
      },
      client,
    );

    await service.createQuotes('order-1');
    expect(client.quote).toHaveBeenCalledTimes(1);
    expect(repository.replaceQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: expect.arrayContaining([
          expect.objectContaining({ insuranceMode: 'none' }),
        ]),
        automaticallySelect: true,
      }),
    );
  });

  it('rejects an order without an eight-digit DANE destination', async () => {
    const service = new ShippingQuoteService(
      {
        shippingPolicy: vi.fn(),
        replaceQuotes: vi.fn(),
        selectQuote: vi.fn(),
        getShipping: vi.fn(),
        upsertCarrierRule: vi.fn(),
        upsertShippingPolicy: vi.fn(),
        defaultShippingPolicy: vi.fn(),
        setDefaultShippingPolicy: vi.fn(),
        listShippingRules: vi.fn(),
        deactivateShippingRule: vi.fn(),
        listObservedCarriers: vi.fn(),
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
