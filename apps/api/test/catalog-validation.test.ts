import { describe, expect, it } from 'vitest';

import { CatalogValidationError } from '../src/modules/catalog/catalog-errors.js';
import {
  normalizeReferenceCode,
  parseShoeSize,
  validatePriceCop,
  validateQuantity,
} from '../src/modules/catalog/catalog-validation.js';

describe('normalizeReferenceCode', () => {
  it('trims, uppercases, and preserves leading zeros', () => {
    expect(normalizeReferenceCode(' 01 ')).toBe('01');
    expect(normalizeReferenceCode('a15')).toBe('A15');
  });

  it('rejects empty and invalid characters', () => {
    expect(() => normalizeReferenceCode('')).toThrow(CatalogValidationError);
    expect(() => normalizeReferenceCode('Z104!')).toThrow(
      CatalogValidationError,
    );
  });
});

describe('parseShoeSize', () => {
  it('normalizes whole and half sizes', () => {
    expect(parseShoeSize(37)).toBe('37');
    expect(parseShoeSize(37.0)).toBe('37');
    expect(parseShoeSize('37.0')).toBe('37');
    expect(parseShoeSize('37.5')).toBe('37.5');
  });

  it('rejects invalid sizes', () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '',
      '37.2',
      -1,
      0,
      100,
    ]) {
      expect(() => parseShoeSize(value as never)).toThrow(
        CatalogValidationError,
      );
    }
  });
});

describe('validatePriceCop', () => {
  it('accepts positive integer pesos', () => {
    expect(validatePriceCop(150000)).toBe(150000);
  });

  it('rejects zero and non-integers', () => {
    expect(() => validatePriceCop(0)).toThrow(CatalogValidationError);
    expect(() => validatePriceCop(10.5)).toThrow(CatalogValidationError);
  });
});

describe('validateQuantity', () => {
  it('accepts zero and positive integers', () => {
    expect(validateQuantity(0)).toBe(0);
    expect(validateQuantity(3)).toBe(3);
  });

  it('rejects negatives', () => {
    expect(() => validateQuantity(-1)).toThrow(CatalogValidationError);
  });
});
