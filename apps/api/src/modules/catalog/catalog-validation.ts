import { CatalogValidationError } from './catalog-errors.js';

export type ShoeSize = string;

const MAX_PRICE_COP = 2_000_000_000;
const MAX_QUANTITY = 2_000_000_000;

export function normalizeReferenceCode(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (normalized.length < 1 || normalized.length > 32) {
    throw new CatalogValidationError(
      'code',
      'invalid_code',
      'Reference code must be between 1 and 32 characters',
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    throw new CatalogValidationError(
      'code',
      'invalid_code',
      'Reference code may only contain uppercase letters, digits, and hyphens',
    );
  }

  return normalized;
}

export function parseShoeSize(value: string | number): ShoeSize {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CatalogValidationError(
        'size',
        'invalid_size',
        'Shoe size must be a finite number',
      );
    }
    return normalizeNumericSize(value);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    throw new CatalogValidationError(
      'size',
      'invalid_size',
      'Shoe size is required',
    );
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new CatalogValidationError(
      'size',
      'invalid_size',
      'Shoe size must be numeric',
    );
  }

  return normalizeNumericSize(numeric);
}

function normalizeNumericSize(value: number): ShoeSize {
  if (value < 1 || value > 99.5) {
    throw new CatalogValidationError(
      'size',
      'invalid_size',
      'Shoe size must be between 1 and 99.5',
    );
  }

  const doubled = value * 2;
  if (!Number.isInteger(doubled)) {
    throw new CatalogValidationError(
      'size',
      'invalid_size',
      'Shoe size must use whole or half increments',
    );
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

export function validatePriceCop(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_PRICE_COP) {
    throw new CatalogValidationError(
      'priceCop',
      'invalid_price',
      'Price must be a positive integer within the allowed range',
    );
  }

  return value;
}

export function validateQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_QUANTITY) {
    throw new CatalogValidationError(
      'quantity',
      'invalid_quantity',
      'Quantity must be a non-negative integer within the allowed range',
    );
  }

  return value;
}
