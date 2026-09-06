const DIGITS_ONLY = /^\d+$/;

export type IntegerDigitsRange = {
  min: number;
  max: number;
};

export function parseIntegerDigits(
  raw: string,
  range: IntegerDigitsRange,
): number | null {
  if (!DIGITS_ONLY.test(raw)) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < range.min || value > range.max) {
    return null;
  }

  return value;
}
