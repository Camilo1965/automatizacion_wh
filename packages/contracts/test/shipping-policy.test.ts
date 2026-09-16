import { describe, expect, it } from 'vitest';
import { ShippingPolicySchema, ShippingRuleBodySchema } from '../src/index.js';
const base = {
  preferredCarrier: 'tcc',
  fallbackPolicy: 'allow',
  offerMode: 'protected_only',
  protectedInsurance: 'plus',
};
describe('routing policy consistency', () => {
  it('accepts an exact municipal policy with advanced preferences', () => {
    expect(
      ShippingRuleBodySchema.safeParse({
        ...base,
        localityCarrierCode: '08001000',
        allowedCarriers: ['tcc', 'envia'],
        orderedCarriers: ['envia'],
      }).success,
    ).toBe(true);
  });
  it('rejects excluded preferred carriers, duplicate priorities and conflicting lists', () => {
    for (const patch of [
      { excludedCarriers: ['tcc'] },
      { allowedCarriers: ['envia'] },
      { orderedCarriers: ['envia', 'envia'] },
      { allowedCarriers: ['tcc', 'envia'], excludedCarriers: ['envia'] },
    ]) {
      expect(
        ShippingPolicySchema.safeParse({ ...base, ...patch }).success,
      ).toBe(false);
    }
  });
});
