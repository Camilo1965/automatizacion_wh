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

const QUANTITY_MAX = 2_000_000_000;
const PHOTO_BYTE_MAX = 5 * 1024 * 1024;

const quantitySchema = z.number().int().min(0).max(QUANTITY_MAX);
const deltaSchema = z.number().int().min(-QUANTITY_MAX).max(QUANTITY_MAX);

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

const AvailableSizesSchema = z
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

const publicUsernameSchema = z
  .string()
  .regex(
    /^[a-z0-9._-]{3,64}$/,
    'Username must be 3–64 lowercase letters, digits, dots, underscores, or hyphens',
  );

const publicReferenceCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^[A-Z0-9-]+$/,
    'Reference code must use uppercase letters, digits, and hyphens only',
  );

const trimmedModelName = z.string().trim().min(1).max(120);
const trimmedColor = z.string().trim().min(1).max(80);
const priceCopSchema = z.number().int().min(1).max(QUANTITY_MAX);

const photoEtagSchema = z
  .string()
  .regex(
    /^"[a-f0-9]{64}"$/,
    'ETag must be a quoted lowercase SHA-256 hex digest',
  );

export const AdminUserPublicSchema = z
  .object({
    id: z.uuid(),
    username: publicUsernameSchema,
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

const orderQuantitySchema = z.number().int().min(1).max(10);
const colombianPhoneSchema = z
  .string()
  .regex(/^\+57\d{10}$/, 'Phone must use +57 followed by ten digits');
const colombianPhoneInputSchema = z
  .string()
  .trim()
  .regex(/^(?:\+?57)?3\d{9}$/, 'Phone must be a Colombian mobile number');
const customerNameSchema = z.string().trim().min(2).max(120);
const addressSchema = z.string().trim().min(5).max(180);
const localityCarrierCodeSchema = z.string().trim().min(1).max(32);
const deliveryNotesSchema = z.string().trim().min(1).max(250);

export const OrderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'cancelled',
  'dispatched',
  'delivered',
  'returned',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const CreateOrderBodySchema = z
  .object({
    referenceId: z.uuid(),
    size: ShoeSizeStringSchema,
    quantity: orderQuantitySchema,
    customerName: customerNameSchema.optional(),
    customerPhone: colombianPhoneInputSchema.optional(),
    address: addressSchema.optional(),
    localityCarrierCode: localityCarrierCodeSchema.optional(),
    deliveryNotes: deliveryNotesSchema.nullable().optional(),
  })
  .strict();
export type CreateOrderBody = z.infer<typeof CreateOrderBodySchema>;

export const PatchOrderBodySchema = z
  .object({
    customerName: customerNameSchema.optional(),
    customerPhone: colombianPhoneInputSchema.optional(),
    address: addressSchema.optional(),
    localityCarrierCode: localityCarrierCodeSchema.optional(),
    deliveryNotes: deliveryNotesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type PatchOrderBody = z.infer<typeof PatchOrderBodySchema>;

export const ConfirmOrderBodySchema = z
  .object({
    summaryVersion: z.number().int().min(1),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export type ConfirmOrderBody = z.infer<typeof ConfirmOrderBodySchema>;

const OrderSummaryReferenceSchema = z
  .object({
    id: z.uuid(),
    code: publicReferenceCodeSchema,
    modelName: trimmedModelName,
    color: trimmedColor,
  })
  .strict();

export const OrderSummarySnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.number().int().min(1),
    draftVersion: z.number().int().min(1),
    orderNumber: z.string().regex(/^PED-\d{6,}$/),
    reference: OrderSummaryReferenceSchema,
    size: ShoeSizeStringSchema,
    quantity: orderQuantitySchema,
    unitPriceCop: priceCopSchema,
    productSubtotalCop: priceCopSchema,
    shippingCostCop: z.null(),
    shippingPending: z.literal(true),
    totalCop: priceCopSchema,
    customer: z
      .object({ name: customerNameSchema, phone: colombianPhoneSchema })
      .strict(),
    destination: z
      .object({
        address: addressSchema,
        localityCarrierCode: localityCarrierCodeSchema,
        department: z.string().trim().min(1).max(100),
        locality: z.string().trim().min(1).max(120),
        deliveryNotes: deliveryNotesSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.productSubtotalCop !== value.unitPriceCop * value.quantity) {
      context.addIssue({
        code: 'custom',
        message: 'productSubtotalCop must equal unitPriceCop * quantity',
        path: ['productSubtotalCop'],
      });
    }
    if (value.totalCop !== value.productSubtotalCop) {
      context.addIssue({
        code: 'custom',
        message:
          'totalCop must equal productSubtotalCop while shipping is pending',
        path: ['totalCop'],
      });
    }
  });
export type OrderSummarySnapshot = z.infer<typeof OrderSummarySnapshotSchema>;

export const SetStockBodySchema = z
  .object({
    physicalQuantity: quantitySchema,
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
    byteSize: z.number().int().min(1).max(PHOTO_BYTE_MAX),
    etag: photoEtagSchema,
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

export const ListMovementsResponseSchema = dataEnvelopeSchema(
  ListMovementsResultSchema,
);
export type ListMovementsResponse = z.infer<typeof ListMovementsResponseSchema>;

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

export const LocalityPublicSchema = z
  .object({
    carrierCode: z.string().min(1).max(32),
    department: z.string().min(1).max(100),
    locality: z.string().min(1).max(120),
    country: z.literal('CO'),
    normalizedName: z.string().min(1).max(240),
  })
  .strict();
export const LocalitiesResponseSchema = dataEnvelopeSchema(
  z
    .object({
      items: z.array(LocalityPublicSchema),
      nextAfterCode: z.string().min(1).max(32).nullable(),
    })
    .strict(),
);
export type LocalityPublic = z.infer<typeof LocalityPublicSchema>;

export const OrderPublicSchema = z
  .object({
    id: z.uuid(),
    orderNumber: z.string().regex(/^PED-\d{6,}$/),
    status: OrderStatusSchema,
    reference: z
      .object({
        id: z.uuid(),
        code: publicReferenceCodeSchema,
        modelName: trimmedModelName,
        color: trimmedColor,
      })
      .strict(),
    size: ShoeSizeStringSchema,
    quantity: orderQuantitySchema,
    customer: z
      .object({
        name: customerNameSchema.nullable(),
        phone: colombianPhoneSchema.nullable(),
      })
      .strict(),
    destination: z
      .object({
        address: addressSchema.nullable(),
        localityCarrierCode: localityCarrierCodeSchema.nullable(),
        localityDepartment: z.string().min(1).max(100).nullable(),
        localityName: z.string().min(1).max(120).nullable(),
        deliveryNotes: deliveryNotesSchema.nullable(),
      })
      .strict(),
    draftVersion: z.number().int().min(1),
    latestSummaryVersion: z.number().int().min(0),
    confirmedSummaryVersion: z.number().int().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type OrderPublic = z.infer<typeof OrderPublicSchema>;

export const OrderSummaryPublicSchema = z
  .object({
    version: z.number().int().min(1),
    draftVersion: z.number().int().min(1),
    snapshot: OrderSummarySnapshotSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type OrderSummaryPublic = z.infer<typeof OrderSummaryPublicSchema>;

export const OrderResponseSchema = dataEnvelopeSchema(OrderPublicSchema);
export const OrderSummaryResponseSchema = dataEnvelopeSchema(
  OrderSummaryPublicSchema,
);
export const ListOrdersResponseSchema = dataEnvelopeSchema(
  z
    .object({
      items: z.array(OrderPublicSchema),
      nextCursor: z
        .object({ createdAt: z.string().datetime(), id: z.uuid() })
        .strict()
        .nullable(),
    })
    .strict(),
);

const shippingCopSchema = z.number().int().min(0).max(QUANTITY_MAX);
const carrierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,32}$/);

export const CarrierRuleBodySchema = z
  .object({
    localityCarrierCode: z.string().regex(/^\d{8}$/),
    carrier: carrierSchema,
  })
  .strict();
export type CarrierRuleBody = z.infer<typeof CarrierRuleBodySchema>;

export const ShippingQuotePublicSchema = z
  .object({
    id: z.uuid(),
    carrier: carrierSchema,
    serviceId: z.number().int().positive(),
    freightCop: shippingCopSchema,
    cashOnDeliveryCop: shippingCopSchema,
    surchargeCop: shippingCopSchema,
    totalShippingCop: shippingCopSchema,
    estimatedDays: z.string().max(32),
    quotedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    recommended: z.boolean(),
    selected: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.totalShippingCop ===
      value.freightCop + value.cashOnDeliveryCop + value.surchargeCop,
    { message: 'totalShippingCop must equal all shipping charges' },
  );
export type ShippingQuotePublic = z.infer<typeof ShippingQuotePublicSchema>;

export const ShippingGuidePublicSchema = z
  .object({
    status: z.enum(['pending', 'processing', 'created', 'uncertain', 'failed']),
    carrier: carrierSchema,
    preShipmentNumber: z.string().min(1).max(64).nullable(),
    freightCop: shippingCopSchema.nullable(),
    errorCode: z.string().min(1).max(64).nullable(),
    pdfAvailable: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ShippingGuidePublic = z.infer<typeof ShippingGuidePublicSchema>;

export const ShippingResponseSchema = dataEnvelopeSchema(
  z
    .object({
      quotes: z.array(ShippingQuotePublicSchema),
      guide: ShippingGuidePublicSchema.nullable(),
    })
    .strict(),
);
export type ShippingResponse = z.infer<typeof ShippingResponseSchema>;

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
