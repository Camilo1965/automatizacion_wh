import { describe, expect, it } from 'vitest';

import { parseIntegerDigits } from './parse-integer-digits';

describe('parseIntegerDigits', () => {
  it('accepts digit-only integers within range', () => {
    expect(parseIntegerDigits('0', { min: 0, max: 10 })).toBe(0);
    expect(parseIntegerDigits('120000', { min: 1, max: 2_000_000_000 })).toBe(
      120_000,
    );
  });

  it('rejects decimals, mixed text, negatives, empty and over max', () => {
    expect(parseIntegerDigits('3.5', { min: 0, max: 10 })).toBeNull();
    expect(parseIntegerDigits('3abc', { min: 0, max: 10 })).toBeNull();
    expect(parseIntegerDigits('-1', { min: 0, max: 10 })).toBeNull();
    expect(parseIntegerDigits('', { min: 0, max: 10 })).toBeNull();
    expect(parseIntegerDigits('11', { min: 0, max: 10 })).toBeNull();
    expect(
      parseIntegerDigits('2000000001', { min: 0, max: 2_000_000_000 }),
    ).toBeNull();
    expect(parseIntegerDigits('120000.5', { min: 1, max: 2_000_000_000 })).toBe(
      null,
    );
  });
});
