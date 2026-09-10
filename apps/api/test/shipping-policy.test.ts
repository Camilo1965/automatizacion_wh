import { describe, expect, it } from 'vitest';

import {
  resolveShippingPolicy,
  shippingOfferInsurances,
} from '../src/modules/shipping/shipping-policy.js';

const defaults = {
  preferredCarrier: null,
  fallbackPolicy: 'allow' as const,
  offerMode: 'customer_choice' as const,
  protectedInsurance: 'standard' as const,
};

describe('shipping policy', () => {
  it('uses an active municipality policy instead of global defaults', () => {
    expect(
      resolveShippingPolicy(defaults, {
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
        active: true,
      }),
    ).toEqual({
      preferredCarrier: 'tcc',
      fallbackPolicy: 'block',
      offerMode: 'protected_only',
      protectedInsurance: 'plus',
    });
  });

  it('uses global defaults when the municipality rule is inactive', () => {
    expect(
      resolveShippingPolicy(defaults, {
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
        active: false,
      }),
    ).toEqual(defaults);
  });

  it('creates economic and protected offers from customer choice', () => {
    expect(shippingOfferInsurances(defaults)).toEqual(['none', 'standard']);
  });

  it('creates only Plus insurance when the city requires protection', () => {
    expect(
      shippingOfferInsurances({
        ...defaults,
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      }),
    ).toEqual(['plus']);
  });
});
