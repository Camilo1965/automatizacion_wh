import { z } from 'zod';

export const WhatsAppConnectionModeSchema = z.enum([
  'cloud_api_only',
  'business_app_coexistence',
]);

export const WhatsAppConnectionSchema = z
  .object({
    mode: WhatsAppConnectionModeSchema,
    mobileAppAvailable: z.boolean(),
    phoneNumberId: z.string().min(1).nullable(),
    wabaId: z.string().min(1).nullable(),
    webhookConfigured: z.boolean(),
    serviceWindowHours: z.literal(24),
    evidenceSource: z.string().min(1).nullable(),
    checkedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.mode === 'business_app_coexistence' &&
      (!value.mobileAppAvailable || value.evidenceSource === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Coexistence requires verified provider evidence',
      });
    }
    if (value.mode === 'cloud_api_only' && value.mobileAppAvailable) {
      context.addIssue({
        code: 'custom',
        message: 'Cloud API only cannot expose the mobile app',
      });
    }
  });

export const WhatsAppConnectionResponseSchema = z
  .object({ data: WhatsAppConnectionSchema })
  .strict();

export type WhatsAppConnection = z.infer<typeof WhatsAppConnectionSchema>;
