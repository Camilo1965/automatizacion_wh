import { describe, expect, it } from 'vitest';

import { operationalLabel } from './operational-label';

describe('operationalLabel', () => {
  it('translates internal customer-flow states into operational Spanish', () => {
    expect(operationalLabel('choose_shipping')).toBe('Esperando tipo de envío');
    expect(operationalLabel('draft')).toBe('Esperando al cliente');
  });

  it('never exposes unknown internal state codes to operators', () => {
    expect(operationalLabel('awaiting_new_internal_state')).toBe(
      'Estado operativo',
    );
    expect(operationalLabel('uncertain')).toBe('Requiere revisión');
  });
});
