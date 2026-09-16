import { z } from 'zod';

export const OwnerAlertSchema = z
  .object({
    id: z.uuid(),
    type: z.string().min(1),
    severity: z.enum(['info', 'warning', 'critical']),
    title: z.string().min(1),
    detail: z.string().min(1),
    entityUrl: z.string().startsWith('/'),
    status: z.enum(['open', 'read', 'resolved']),
    attempts: z.number().int().nonnegative(),
    retrySafe: z.boolean(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    notificationStatus: z
      .enum(['processing', 'sent', 'uncertain'])
      .nullable()
      .optional(),
  })
  .strict();
export const OwnerAlertsResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(OwnerAlertSchema),
        nextCursor: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type OwnerAlert = z.infer<typeof OwnerAlertSchema>;

export const InventoryClosureSchema = z
  .object({
    id: z.uuid(),
    businessDate: z.iso.date(),
    version: z.number().int().positive(),
    profile: z.enum(['absolute', 'adjustments']),
    status: z.enum(['generated', 'acknowledged', 'reopened']),
    movementCount: z.number().int().nonnegative(),
    totalUnits: z.number().int(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime(),
    acknowledgedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const InventoryClosureResponseSchema = z
  .object({ data: InventoryClosureSchema })
  .strict();
export const InventoryClosuresResponseSchema = z
  .object({
    data: z.object({ items: z.array(InventoryClosureSchema) }).strict(),
  })
  .strict();
export type InventoryClosure = z.infer<typeof InventoryClosureSchema>;

const IntegrationCheckSchema = z
  .object({
    status: z.enum(['up', 'degraded', 'down']),
    checkedAt: z.iso.datetime(),
    detail: z.string().nullable(),
  })
  .strict();
export const IntegrationHealthSchema = z
  .object({
    database: IntegrationCheckSchema,
    mediaStorage: IntegrationCheckSchema,
    whatsapp: IntegrationCheckSchema,
    shipping: IntegrationCheckSchema,
    scheduler: IntegrationCheckSchema,
  })
  .strict();
export const IntegrationHealthResponseSchema = z
  .object({ data: IntegrationHealthSchema })
  .strict();
export type IntegrationHealth = z.infer<typeof IntegrationHealthSchema>;
