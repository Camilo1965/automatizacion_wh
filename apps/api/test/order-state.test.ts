import { describe, expect, it } from 'vitest';

import { assertTransition } from '../src/modules/orders/order-state.js';

describe('order state transitions', () => {
  it('allows confirming a draft', () => {
    expect(assertTransition('draft', 'confirm')).toBe('confirmed');
  });

  it('rejects dispatching an unconfirmed draft', () => {
    expect(() => assertTransition('draft', 'dispatch')).toThrow('not allowed');
  });
});
