import { z } from 'zod';

import { dataEnvelopeSchema } from './shared.js';

export const AuditResultSchema = z.enum(['success', 'failure']);
export type AuditResult = z.infer<typeof AuditResultSchema>;

export const AuditEventSchema = z
  .object({
    id: z.uuid(),
    actorUserId: z.uuid().nullable(),
    actorUsername: z.string().nullable(),
    action: z.string().min(1),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    correlationId: z.string().nullable(),
    metadata: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    result: AuditResultSchema,
    /** Present only if a one-way IP hash was stored; raw IP is never returned. */
    ipHash: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    actorUserId: z.uuid().optional(),
    action: z.string().min(1).max(64).optional(),
    targetType: z.string().min(1).max(64).optional(),
    targetId: z.string().min(1).max(128).optional(),
    result: AuditResultSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;

export const AuditListDataSchema = z
  .object({
    items: z.array(AuditEventSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict();

export type AuditListData = z.infer<typeof AuditListDataSchema>;

export const AuditListResponseSchema = dataEnvelopeSchema(AuditListDataSchema);
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

/** Historial UI contract — unified security/business audit list. */
export const ConfigurationAuditResponseSchema = AuditListResponseSchema;
