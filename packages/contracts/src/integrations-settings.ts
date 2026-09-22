import { z } from 'zod';

import { dataEnvelopeSchema } from './shared.js';

const optionalSecretSchema = z.string().trim().min(1).max(4096).optional();
export const OwnerServiceHoursSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine(
    (value) =>
      value.start < value.end && new Set(value.days).size === value.days.length,
    {
      message: 'El horario debe terminar después de iniciar y no repetir días.',
    },
  );
export const IntegrationSettingsUpdateSchema = z
  .object({
    whatsapp: z
      .object({
        phoneNumberId: z.string().trim().min(1).max(64).optional(),
        timezone: z.literal('America/Bogota').optional(),
        serviceHours: OwnerServiceHoursSchema.nullable().optional(),
        wabaId: z.string().regex(/^\d+$/).optional(),
        ownerAlertPhone: z
          .string()
          .regex(/^\+?57[3]\d{9}$/)
          .optional(),
        ownerAlertTemplate: z
          .string()
          .regex(/^[a-z0-9_]{1,512}$/)
          .optional(),
        graphApiVersion: z
          .string()
          .regex(/^v\d+\.\d+$/)
          .optional(),
        accessToken: optionalSecretSchema,
        appSecret: optionalSecretSchema,
        webhookVerifyToken: optionalSecretSchema,
      })
      .strict()
      .optional(),
    shipping: z
      .object({
        accountEmail: z.string().trim().email().max(254).optional(),
        branchCode: z.string().regex(/^\d+$/).optional(),
        pdfType: z.union([z.literal(1), z.literal(2)]).optional(),
        originLocalityCode: z
          .string()
          .regex(/^\d{8}$/)
          .optional(),
        password: optionalSecretSchema,
        integrationToken: optionalSecretSchema,
        integrationId: z.string().trim().min(1).max(128).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.whatsapp !== undefined || value.shipping !== undefined,
    {
      message: 'Configure al menos una integración',
    },
  );

export const IntegrationSettingsResponseSchema = dataEnvelopeSchema(
  z
    .object({
      whatsapp: z
        .object({
          configured: z.boolean(),
          phoneNumberId: z.string().nullable(),
          timezone: z.literal('America/Bogota').optional(),
          serviceHours: OwnerServiceHoursSchema.nullable().optional(),
          graphApiVersion: z.string().nullable().optional(),
          wabaId: z.string().nullable().optional(),
          ownerAlertPhone: z.string().nullable().optional(),
          ownerAlertTemplate: z.string().nullable().optional(),
        })
        .strict(),
      shipping: z
        .object({
          configured: z.boolean(),
          accountEmail: z.string().email().nullable(),
          integrationId: z.string().nullable().optional(),
          branchCode: z.string().nullable().optional(),
          pdfType: z.union([z.literal(1), z.literal(2)]).optional(),
          originLocalityCode: z
            .string()
            .regex(/^\d{8}$/)
            .optional(),
        })
        .strict(),
    })
    .strict(),
);
