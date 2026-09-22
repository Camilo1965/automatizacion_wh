import { z } from 'zod';

import {
  AvailableSizesSchema,
  PHOTO_BYTE_MAX,
  ShoeSizeStringSchema,
  coercePositiveInt,
  dataEnvelopeSchema,
  photoEtagSchema,
  priceCopSchema,
  publicReferenceCodeSchema,
  quantitySchema,
  trimmedColor,
  trimmedModelName,
} from './shared.js';

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
    physicalQuantity: quantitySchema,
    note: z.string().trim().min(3).max(250),
  })
  .strict();

export type SetStockBody = z.infer<typeof SetStockBodySchema>;

export const ListReferencesQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    afterCode: z.string().min(1).optional(),
    limit: coercePositiveInt(25, 100).default(25),
  })
  .strict();

export type ListReferencesQuery = z.infer<typeof ListReferencesQuerySchema>;

export const PhotoPublicSchema = z
  .object({
    url: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    byteSize: z.number().int().min(1).max(PHOTO_BYTE_MAX),
    etag: photoEtagSchema,
  })
  .strict();

export type PhotoPublic = z.infer<typeof PhotoPublicSchema>;

export const ReferencePublicSchema = z
  .object({
    id: z.uuid(),
    code: publicReferenceCodeSchema,
    modelName: trimmedModelName,
    color: trimmedColor,
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
    code: publicReferenceCodeSchema,
    modelName: trimmedModelName,
    color: trimmedColor,
    priceCop: priceCopSchema,
    active: z.boolean(),
    photo: PhotoPublicSchema.nullable(),
    availableSizes: AvailableSizesSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ReferenceSummary = z.infer<typeof ReferenceSummarySchema>;

export const StockAvailabilitySchema = z
  .object({
    size: ShoeSizeStringSchema,
    physicalQuantity: quantitySchema,
    reservedQuantity: quantitySchema,
    availableQuantity: quantitySchema,
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.reservedQuantity <= value.physicalQuantity, {
    message: 'reservedQuantity must be <= physicalQuantity',
  })
  .refine(
    (value) =>
      value.availableQuantity ===
      value.physicalQuantity - value.reservedQuantity,
    {
      message:
        'availableQuantity must equal physicalQuantity - reservedQuantity',
    },
  );

export type StockAvailability = z.infer<typeof StockAvailabilitySchema>;

export const ReferenceDetailSchema = ReferencePublicSchema.extend({
  stock: z.array(StockAvailabilitySchema),
}).strict();

export type ReferenceDetail = z.infer<typeof ReferenceDetailSchema>;

export const ListReferencesResultSchema = z
  .object({
    items: z.array(ReferenceSummarySchema),
    nextAfterCode: z.string().nullable(),
  })
  .strict();

export type ListReferencesResult = z.infer<typeof ListReferencesResultSchema>;

export const StockSetResultSchema = z.intersection(
  StockAvailabilitySchema,
  z
    .object({
      referenceId: z.uuid(),
    })
    .strict(),
);

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

export const StockResponseSchema = dataEnvelopeSchema(StockSetResultSchema);
export type StockResponse = z.infer<typeof StockResponseSchema>;

export const CatalogImportErrorSchema = z
  .object({
    row: z.number().int().min(1),
    field: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export const CatalogImportReferenceSchema = z
  .object({
    code: publicReferenceCodeSchema,
    modelName: trimmedModelName,
    color: trimmedColor,
    priceCop: priceCopSchema,
    stock: z
      .array(
        z
          .object({
            size: ShoeSizeStringSchema,
            physicalQuantity: quantitySchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const CatalogImportSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['previewed', 'invalid', 'committed']),
    references: z.array(CatalogImportReferenceSchema),
    errors: z.array(CatalogImportErrorSchema),
    createdAt: z.string().datetime(),
  })
  .strict();
export const CatalogImportResponseSchema =
  dataEnvelopeSchema(CatalogImportSchema);
export type CatalogImportResult = z.infer<typeof CatalogImportSchema>;

export const CatalogReadinessSchema = z
  .object({
    total: quantitySchema,
    active: quantitySchema,
    withoutPhoto: quantitySchema,
    withoutAvailableStock: quantitySchema,
    ready: quantitySchema,
  })
  .strict();
export const CatalogReadinessResponseSchema = dataEnvelopeSchema(
  CatalogReadinessSchema,
);
export type CatalogReadiness = z.infer<typeof CatalogReadinessSchema>;
