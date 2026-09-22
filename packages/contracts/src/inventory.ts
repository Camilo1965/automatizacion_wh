import { z } from 'zod';

import {
  ShoeSizeStringSchema,
  coercePositiveInt,
  dataEnvelopeSchema,
  deltaSchema,
  quantitySchema,
} from './shared.js';

export const ListMovementsQuerySchema = z
  .object({
    size: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: coercePositiveInt(50, 100).default(50),
  })
  .strict();

export type ListMovementsQuery = z.infer<typeof ListMovementsQuerySchema>;

export const InventoryMovementPublicSchema = z
  .object({
    id: z.uuid(),
    size: ShoeSizeStringSchema,
    previousQuantity: quantitySchema,
    newQuantity: quantitySchema,
    delta: deltaSchema,
    reason: z.enum(['initial', 'manual_adjustment']),
    note: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) => value.delta === value.newQuantity - value.previousQuantity,
    { message: 'delta must equal newQuantity - previousQuantity' },
  );

export type InventoryMovementPublic = z.infer<
  typeof InventoryMovementPublicSchema
>;

export const ListMovementsResultSchema = z
  .object({
    items: z.array(InventoryMovementPublicSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type ListMovementsResult = z.infer<typeof ListMovementsResultSchema>;

export const ListMovementsResponseSchema = dataEnvelopeSchema(
  ListMovementsResultSchema,
);
export type ListMovementsResponse = z.infer<typeof ListMovementsResponseSchema>;

export type MovementCursor = {
  createdAt: Date;
  id: string;
};

const MovementCursorPayloadSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.uuid(),
  })
  .strict();

export function encodeMovementCursor(cursor: MovementCursor): string {
  const payload = JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeMovementCursor(cursor: string): MovementCursor {
  if (cursor.trim() === '') {
    throw new Error('Invalid movement cursor');
  }

  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid movement cursor');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid movement cursor');
  }

  const result = MovementCursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Invalid movement cursor');
  }

  return {
    createdAt: new Date(result.data.createdAt),
    id: result.data.id,
  };
}
