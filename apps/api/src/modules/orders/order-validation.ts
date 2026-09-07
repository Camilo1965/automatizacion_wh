import { OrderValidationError } from './order-errors.js';

export function normalizeColombianPhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '');
  const national = digits.startsWith('57') ? digits.slice(2) : digits;
  if (!/^3\d{9}$/.test(national)) {
    throw new OrderValidationError(
      'customerPhone',
      'invalid_phone',
      'Phone must be a Colombian mobile number',
    );
  }
  return `+57${national}`;
}

export function validateOrderQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new OrderValidationError(
      'quantity',
      'invalid_quantity',
      'Quantity must be an integer between 1 and 10',
    );
  }
  return value;
}
