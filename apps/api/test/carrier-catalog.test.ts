import { describe, expect, it } from 'vitest';

import {
  CARRIER_CATALOG,
  isCarrierId,
} from '../src/modules/shipping/carrier-catalog.js';

describe('99envíos carrier catalog', () => {
  it('exposes only the five supported providers', () => {
    expect(CARRIER_CATALOG.map((carrier) => carrier.id)).toEqual([
      'interrapidisimo',
      'tcc',
      'servientrega',
      'coordinadora',
      'envia',
    ]);
    expect(isCarrierId('tcc')).toBe(true);
    expect(isCarrierId('otra')).toBe(false);
  });
});
