import { z } from 'zod';

import {
  carrierSchema,
  dataEnvelopeSchema,
  shippingCopSchema,
} from './shared.js';

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

export const DepartmentPublicSchema = z
  .object({
    name: z.string().min(1).max(100),
    localityCount: z.number().int().nonnegative(),
  })
  .strict();
export type DepartmentPublic = z.infer<typeof DepartmentPublicSchema>;
export const DepartmentsResponseSchema = dataEnvelopeSchema(
  z.object({ items: z.array(DepartmentPublicSchema) }).strict(),
);

export const ShippingOfferModeSchema = z.enum([
  'customer_choice',
  'economy_only',
  'protected_only',
]);
export const InsuranceModeSchema = z.enum(['none', 'standard', 'plus']);
export const ShippingFallbackPolicySchema = z.enum(['allow', 'block']);
export const ShippingPolicySchema = z
  .object({
    revision: z.number().int().nonnegative().optional(),
    preferredCarrier: carrierSchema.nullable(),
    fallbackPolicy: ShippingFallbackPolicySchema,
    offerMode: ShippingOfferModeSchema,
    protectedInsurance: z.enum(['standard', 'plus']),
    allowedCarriers: z.array(carrierSchema).min(1).max(5).optional(),
    excludedCarriers: z.array(carrierSchema).max(5).optional(),
    orderedCarriers: z.array(carrierSchema).max(5).optional(),
    insuranceThresholdCop: z.number().int().nonnegative().nullable().optional(),
    packageDefaults: z
      .object({
        weightKg: z.number().positive().max(100),
        lengthCm: z.number().positive().max(200),
        widthCm: z.number().positive().max(200),
        heightCm: z.number().positive().max(200),
        contents: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fallbackPolicy !== 'block' || value.preferredCarrier !== null,
    {
      message: 'A blocked fallback requires a preferred carrier',
      path: ['preferredCarrier'],
    },
  )
  .refine(
    (value) => {
      const allowed = value.allowedCarriers ?? [];
      const excluded = value.excludedCarriers ?? [];
      const ordered = value.orderedCarriers ?? [];
      const candidates = [value.preferredCarrier, ...ordered].filter(
        (carrier): carrier is string => carrier !== null,
      );
      return (
        [allowed, excluded, ordered].every(
          (list) => new Set(list).size === list.length,
        ) &&
        !allowed.some((carrier) => excluded.includes(carrier)) &&
        candidates.every(
          (carrier) =>
            !excluded.includes(carrier) &&
            (allowed.length === 0 || allowed.includes(carrier)),
        )
      );
    },
    {
      message:
        'Las transportadoras permitidas, excluidas y preferidas deben ser consistentes.',
    },
  );
export type ShippingPolicy = z.infer<typeof ShippingPolicySchema>;

export const ShippingRuleBodySchema = ShippingPolicySchema.safeExtend({
  localityCarrierCode: z.string().regex(/^\d{8}$/),
});
export type ShippingRuleBody = z.infer<typeof ShippingRuleBodySchema>;

export const ShippingRulePublicSchema = z
  .object({
    revision: z.number().int().nonnegative().optional(),
    allowedCarriers: z.array(carrierSchema).min(1).max(5).optional(),
    excludedCarriers: z.array(carrierSchema).max(5).optional(),
    orderedCarriers: z.array(carrierSchema).max(5).optional(),
    insuranceThresholdCop: z.number().int().nonnegative().nullable().optional(),
    packageDefaults: z
      .object({
        weightKg: z.number().positive(),
        lengthCm: z.number().positive(),
        widthCm: z.number().positive(),
        heightCm: z.number().positive(),
        contents: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
    localityCarrierCode: z.string().regex(/^\d{8}$/),
    locality: z.string().min(1).max(120),
    department: z.string().min(1).max(100),
    preferredCarrier: carrierSchema.nullable(),
    fallbackPolicy: ShippingFallbackPolicySchema,
    offerMode: ShippingOfferModeSchema,
    protectedInsurance: z.enum(['standard', 'plus']),
    active: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ShippingRulePublic = z.infer<typeof ShippingRulePublicSchema>;
export const ShippingPreferencesResponseSchema =
  dataEnvelopeSchema(ShippingPolicySchema);
export const ShippingRuleResponseSchema = dataEnvelopeSchema(
  ShippingRulePublicSchema,
);
export const ShippingRulesResponseSchema = dataEnvelopeSchema(
  z.object({ items: z.array(ShippingRulePublicSchema) }).strict(),
);
export const ShippingCarriersResponseSchema = dataEnvelopeSchema(
  z.object({ items: z.array(carrierSchema) }).strict(),
);
export const ShippingPolicyPreviewBodySchema = z
  .object({ localityCarrierCode: z.string().regex(/^\d{8}$/) })
  .strict();
export const ShippingPolicyPreviewSchema = z
  .object({
    localityCarrierCode: z.string().regex(/^\d{8}$/),
    source: z.enum(['global', 'municipality']),
    policy: ShippingPolicySchema,
  })
  .strict();
export const ShippingPolicyPreviewResponseSchema = dataEnvelopeSchema(
  ShippingPolicyPreviewSchema,
);

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
    insuranceMode: InsuranceModeSchema,
    insuranceCop: shippingCopSchema,
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
      value.freightCop +
        value.cashOnDeliveryCop +
        value.surchargeCop +
        value.insuranceCop,
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
