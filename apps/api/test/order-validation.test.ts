import { describe, expect, it } from 'vitest';

import {
  normalizeColombianPhone,
  validateOrderQuantity,
} from '../src/modules/orders/order-validation.js';

describe('order validation', () => {
  it('normalizes Colombian mobile digits to E.164', () => {
    expect(normalizeColombianPhone('3001234567')).toBe('+573001234567');
    expect(normalizeColombianPhone('573001234567')).toBe('+573001234567');
    expect(normalizeColombianPhone('+57 300 123 4567')).toBe('+573001234567');
  });

  it('rejects invalid Colombian phones', () => {
    expect(() => normalizeColombianPhone('2001234567')).toThrow('Phone');
    expect(() => normalizeColombianPhone('300123')).toThrow('Phone');
  });

  it('rejects quantities outside one through ten', () => {
    expect(() => validateOrderQuantity(0)).toThrow('Quantity');
    expect(() => validateOrderQuantity(11)).toThrow('Quantity');
    expect(() => validateOrderQuantity(10.5)).toThrow('Quantity');
    expect(validateOrderQuantity(1)).toBe(1);
    expect(validateOrderQuantity(10)).toBe(10);
  });
});
