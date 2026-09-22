import { z } from 'zod';

import {
  ShoeSizeStringSchema,
  carrierSchema,
  dataEnvelopeSchema,
  priceCopSchema,
  publicReferenceCodeSchema,
  shippingCopSchema,
  trimmedColor,
  trimmedModelName,
} from './shared.js';

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
    shippingCostCop: shippingCopSchema.nullable(),
    shippingPending: z.boolean(),
    shippingQuote: z
      .object({
        id: z.uuid(),
        carrier: carrierSchema,
        serviceId: z.number().int().positive(),
        freightCop: shippingCopSchema,
        cashOnDeliveryCop: shippingCopSchema,
        surchargeCop: shippingCopSchema,
        insuranceMode: z.enum(['none', 'standard', 'plus']).optional(),
        insuranceCop: shippingCopSchema.optional(),
        estimatedDays: z.string().max(32),
        expiresAt: z.string().datetime(),
      })
      .strict()
      .optional(),
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
    const shippingTotal = value.shippingQuote
      ? value.shippingQuote.freightCop +
        value.shippingQuote.cashOnDeliveryCop +
        value.shippingQuote.surchargeCop +
        (value.shippingQuote.insuranceCop ?? 0)
      : 0;
    if (
      value.shippingPending !== (value.shippingQuote === undefined) ||
      value.shippingCostCop !==
        (value.shippingQuote === undefined ? null : shippingTotal)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Shipping state must match the selected quote',
        path: ['shippingPending'],
      });
    }
    if (value.totalCop !== value.productSubtotalCop + shippingTotal) {
      context.addIssue({
        code: 'custom',
        message: 'totalCop must equal product subtotal plus shipping charges',
        path: ['totalCop'],
      });
    }
  });
export type OrderSummarySnapshot = z.infer<typeof OrderSummarySnapshotSchema>;

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
