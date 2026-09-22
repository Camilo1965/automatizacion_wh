import { describe, expect, it } from 'vitest';

import { assertTransition } from '../src/modules/orders/order-state.js';

describe('order state transitions', () => {
  it('allows confirming a draft', () => {
    expect(assertTransition('draft', 'confirm')).toBe('confirmed');
  });

  it('allows dispatching a confirmed order', () => {
    expect(assertTransition('confirmed', 'dispatch')).toBe('dispatched');
  });

  it('rejects dispatching an unconfirmed draft', () => {
    expect(() => assertTransition('draft', 'dispatch')).toThrow('not allowed');
  });

  it('rejects confirming a cancelled order', () => {
    expect(() => assertTransition('cancelled', 'confirm')).toThrow(
      'not allowed',
    );
  });

  it('rejects dispatching a delivered order', () => {
    expect(() => assertTransition('delivered', 'dispatch')).toThrow(
      'not allowed',
    );
  });
});
