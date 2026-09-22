import { z } from 'zod';

export const QUANTITY_MAX = 2_000_000_000;
export const PHOTO_BYTE_MAX = 5 * 1024 * 1024;

export const quantitySchema = z.number().int().min(0).max(QUANTITY_MAX);
export const deltaSchema = z
  .number()
  .int()
  .min(-QUANTITY_MAX)
  .max(QUANTITY_MAX);

export const ShoeSizeStringSchema = z
  .string()
  .refine((value) => /^(?:[1-9]|[1-9]\d)(?:\.5)?$/.test(value), {
    message: 'Shoe size must be a canonical whole or half size string',
  })
  .refine(
    (value) => {
      const numeric = Number(value);
      return numeric >= 1 && numeric <= 99.5;
    },
    { message: 'Shoe size must be between 1 and 99.5' },
  );

export type ShoeSizeString = z.infer<typeof ShoeSizeStringSchema>;

export const AvailableSizesSchema = z
  .array(ShoeSizeStringSchema)
  .superRefine((sizes, ctx) => {
    const seen = new Set<string>();
    for (let index = 0; index < sizes.length; index += 1) {
      const size = sizes[index]!;
      if (seen.has(size)) {
        ctx.addIssue({
          code: 'custom',
          message: 'availableSizes must not contain duplicates',
          path: [index],
        });
      }
      seen.add(size);
      if (index > 0) {
        const previous = Number(sizes[index - 1]);
        const current = Number(size);
        if (!(previous < current)) {
          ctx.addIssue({
            code: 'custom',
            message: 'availableSizes must be sorted ascending numerically',
            path: [index],
          });
        }
      }
    }
  });

export const publicUsernameSchema = z
  .string()
  .regex(
    /^[a-z0-9._-]{3,64}$/,
    'Username must be 3–64 lowercase letters, digits, dots, underscores, or hyphens',
  );

export const publicReferenceCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^[A-Z0-9-]+$/,
    'Reference code must use uppercase letters, digits, and hyphens only',
  );

export const trimmedModelName = z.string().trim().min(1).max(120);
export const trimmedColor = z.string().trim().min(1).max(80);
export const priceCopSchema = z.number().int().min(1).max(QUANTITY_MAX);
export const shippingCopSchema = z.number().int().min(0).max(QUANTITY_MAX);
export const carrierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,32}$/);

export const photoEtagSchema = z
  .string()
  .regex(
    /^"[a-f0-9]{64}"$/,
    'ETag must be a quoted lowercase SHA-256 hex digest',
  );

export function coercePositiveInt(defaultValue: number, max: number) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }
    return value;
  }, z.number().int().min(1).max(max));
}

export function dataEnvelopeSchema<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema }).strict();
}
