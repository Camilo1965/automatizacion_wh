import { describe, expect, it } from 'vitest';

import { CarrierRuleBodySchema, ShippingResponseSchema } from '../src/index.js';

const quote = {
  id: '11111111-1111-4111-8111-111111111111',
  carrier: 'envia',
  serviceId: 12,
  freightCop: 13_368,
  cashOnDeliveryCop: 3_000,
  surchargeCop: 600,
  totalShippingCop: 16_968,
  estimatedDays: '1',
  quotedAt: '2026-09-07T17:00:00.000Z',
  expiresAt: '2026-09-07T17:30:00.000Z',
  recommended: true,
  selected: true,
};

describe('shipping contracts', () => {
  it('accepts an eight-digit DANE carrier rule and normalizes carrier names', () => {
    expect(
      CarrierRuleBodySchema.parse({
        localityCarrierCode: '05001000',
        carrier: 'Envia',
      }),
    ).toEqual({ localityCarrierCode: '05001000', carrier: 'envia' });
    expect(
      CarrierRuleBodySchema.safeParse({
        localityCarrierCode: '5001',
        carrier: 'envia',
      }).success,
    ).toBe(false);
  });

  it('accepts a strict shipping state and rejects inconsistent totals', () => {
    const payload = {
      data: { quotes: [quote], guide: null },
    };
    expect(ShippingResponseSchema.parse(payload)).toEqual(payload);
    expect(
      ShippingResponseSchema.safeParse({
        data: { quotes: [{ ...quote, totalShippingCop: 1 }], guide: null },
      }).success,
    ).toBe(false);
  });
});
