import { z } from 'zod';

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        field: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AdminUserPublicSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1),
  })
  .strict();

export type AdminUserPublic = z.infer<typeof AdminUserPublicSchema>;

export const LoginBodySchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .strict();

export type LoginBody = z.infer<typeof LoginBodySchema>;

const trimmedModelName = z.string().trim().min(1).max(120);
const trimmedColor = z.string().trim().min(1).max(80);
const priceCopSchema = z.number().int().min(1).max(2_000_000_000);

export const CreateReferenceBodySchema = z
  .object({
    code: z.string().min(1).max(32),
    modelName: trimmedModelName,
    color: trimmedColor,
    priceCop: priceCopSchema,
  })
  .strict();

export type CreateReferenceBody = z.infer<typeof CreateReferenceBodySchema>;

export const PatchReferenceBodySchema = z
  .object({
    modelName: trimmedModelName.optional(),
    color: trimmedColor.optional(),
    priceCop: priceCopSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.modelName !== undefined ||
      value.color !== undefined ||
      value.priceCop !== undefined,
    { message: 'At least one field is required' },
  );

export type PatchReferenceBody = z.infer<typeof PatchReferenceBodySchema>;

export const SetStockBodySchema = z
  .object({
    physicalQuantity: z.number().int().min(0).max(2_000_000_000),
    note: z.string().trim().min(3).max(250),
  })
  .strict();

export type SetStockBody = z.infer<typeof SetStockBodySchema>;

function coercePositiveInt(defaultValue: number, max: number) {
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

export const ListReferencesQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    afterCode: z.string().min(1).optional(),
    limit: coercePositiveInt(25, 100).default(25),
  })
  .strict();

export type ListReferencesQuery = z.infer<typeof ListReferencesQuerySchema>;

export const ListMovementsQuerySchema = z
  .object({
    size: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: coercePositiveInt(50, 100).default(50),
  })
  .strict();

export type ListMovementsQuery = z.infer<typeof ListMovementsQuerySchema>;

export const PhotoPublicSchema = z
  .object({
    url: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    byteSize: z.number().int().positive(),
    etag: z.string().min(1),
  })
  .strict();

export type PhotoPublic = z.infer<typeof PhotoPublicSchema>;

export function dataEnvelopeSchema<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema }).strict();
}

export const SessionDataSchema = z
  .object({
    user: AdminUserPublicSchema,
  })
  .strict();

export type SessionData = z.infer<typeof SessionDataSchema>;

export const SessionResponseSchema = dataEnvelopeSchema(SessionDataSchema);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const LoginResponseSchema = dataEnvelopeSchema(SessionDataSchema);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ReferencePublicSchema = z
  .object({
    id: z.uuid(),
    code: z.string().min(1),
    modelName: z.string().min(1),
    color: z.string().min(1),
    priceCop: priceCopSchema,
    active: z.boolean(),
    photo: PhotoPublicSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ReferencePublic = z.infer<typeof ReferencePublicSchema>;

export const ReferenceSummarySchema = z
  .object({
    id: z.uuid(),
    code: z.string().min(1),
    modelName: z.string().min(1),
    color: z.string().min(1),
    priceCop: priceCopSchema,
    active: z.boolean(),
    photo: PhotoPublicSchema.nullable(),
    availableSizes: z.array(z.string()),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ReferenceSummary = z.infer<typeof ReferenceSummarySchema>;

export const StockAvailabilitySchema = z
  .object({
    size: z.string().min(1),
    physicalQuantity: z.number().int().min(0),
    reservedQuantity: z.number().int().min(0),
    availableQuantity: z.number().int(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type StockAvailability = z.infer<typeof StockAvailabilitySchema>;

export const ReferenceDetailSchema = ReferencePublicSchema.extend({
  stock: z.array(StockAvailabilitySchema),
}).strict();

export type ReferenceDetail = z.infer<typeof ReferenceDetailSchema>;

export const InventoryMovementPublicSchema = z
  .object({
    id: z.uuid(),
    size: z.string().min(1),
    previousQuantity: z.number().int(),
    newQuantity: z.number().int(),
    delta: z.number().int(),
    reason: z.string().min(1),
    note: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type InventoryMovementPublic = z.infer<
  typeof InventoryMovementPublicSchema
>;

export const ListReferencesResultSchema = z
  .object({
    items: z.array(ReferenceSummarySchema),
    nextAfterCode: z.string().nullable(),
  })
  .strict();

export type ListReferencesResult = z.infer<typeof ListReferencesResultSchema>;

export const ListMovementsResultSchema = z
  .object({
    items: z.array(InventoryMovementPublicSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type ListMovementsResult = z.infer<typeof ListMovementsResultSchema>;

export const StockSetResultSchema = StockAvailabilitySchema.extend({
  referenceId: z.uuid(),
}).strict();

export type StockSetResult = z.infer<typeof StockSetResultSchema>;

export const PhotoUploadWarningSchema = z.literal('old_photo_cleanup_failed');
export type PhotoUploadWarning = z.infer<typeof PhotoUploadWarningSchema>;

export const PhotoUploadResponseSchema = z
  .object({
    data: ReferencePublicSchema,
    warnings: z.array(PhotoUploadWarningSchema).optional(),
  })
  .strict();

export type PhotoUploadResponse = z.infer<typeof PhotoUploadResponseSchema>;

export const ReferenceDetailResponseSchema = dataEnvelopeSchema(
  ReferenceDetailSchema,
);
export type ReferenceDetailResponse = z.infer<
  typeof ReferenceDetailResponseSchema
>;

export const ReferencePublicResponseSchema = dataEnvelopeSchema(
  ReferencePublicSchema,
);
export type ReferencePublicResponse = z.infer<
  typeof ReferencePublicResponseSchema
>;

export const ListReferencesResponseSchema = dataEnvelopeSchema(
  ListReferencesResultSchema,
);
export type ListReferencesResponse = z.infer<
  typeof ListReferencesResponseSchema
>;

export const ListMovementsResponseSchema = dataEnvelopeSchema(
  ListMovementsResultSchema,
);
export type ListMovementsResponse = z.infer<typeof ListMovementsResponseSchema>;

export const StockResponseSchema = dataEnvelopeSchema(StockSetResultSchema);
export type StockResponse = z.infer<typeof StockResponseSchema>;

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
