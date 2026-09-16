import { describe, expect, it } from 'vitest';

import { selectRecommendedCarrier } from '../src/modules/shipping/shipping-selection.js';

const quotes = [
  {
    carrier: 'envia',
    freightCop: 14000,
    cashOnDeliveryCop: 3000,
    surchargeCop: 0,
  },
  {
    carrier: 'tcc',
    freightCop: 11000,
    cashOnDeliveryCop: 2500,
    surchargeCop: 0,
  },
];

describe('selectRecommendedCarrier', () => {
  it('honors the configured municipality carrier even if it is more expensive', () => {
    expect(selectRecommendedCarrier(quotes, 'envia')).toBe('envia');
  });

  it('uses the cheapest complete cost when no municipality rule applies', () => {
    expect(selectRecommendedCarrier(quotes, null)).toBe('tcc');
  });
  it('excludes forbidden carriers and honors ordered alternatives', () => {
    expect(
      selectRecommendedCarrier(quotes, {
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        excludedCarriers: ['tcc'],
      }),
    ).toBe('envia');
    expect(
      selectRecommendedCarrier(quotes, {
        preferredCarrier: 'coordinadora',
        fallbackPolicy: 'allow',
        orderedCarriers: ['envia', 'tcc'],
      }),
    ).toBe('envia');
  });

  it('uses the lowest complete charge when Envia has no coverage', () => {
    expect(selectRecommendedCarrier([quotes[1]!], null)).toBe('tcc');
  });

  it('does not silently replace an unavailable required carrier', () => {
    expect(
      selectRecommendedCarrier([quotes[0]!], {
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
      }),
    ).toBeNull();
  });
});
