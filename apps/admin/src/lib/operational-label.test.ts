import { describe, expect, it } from 'vitest';

import { operationalLabel } from './operational-label';

describe('operationalLabel', () => {
  it('translates internal customer-flow states into operational Spanish', () => {
    expect(operationalLabel('choose_shipping')).toBe('Esperando tipo de envío');
    expect(operationalLabel('draft')).toBe('Esperando al cliente');
  });
});
