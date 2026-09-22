import { z } from 'zod';

/** Explicit privacy data classes with per-class retention strategy. */
export const PrivacyDataClassSchema = z.enum([
  'whatsapp_inbound_messages',
  'whatsapp_conversation_messages',
  'whatsapp_outbound_messages',
  'whatsapp_conversations',
  'sales_orders_customer_pii',
  'admin_sessions_expired',
  'owner_alerts_resolved',
  'admin_audit_events',
]);
export type PrivacyDataClass = z.infer<typeof PrivacyDataClassSchema>;

export const RetentionActionSchema = z.enum(['retain', 'anonymize', 'delete']);
export type RetentionAction = z.infer<typeof RetentionActionSchema>;

/**
 * Legal status for a class duration/basis.
 * Durations stay pending_human_approval until Colombia owner approval ([HUMANO]).
 */
export const LegalStatusSchema = z.enum(['pending_human_approval', 'approved']);
export type LegalStatus = z.infer<typeof LegalStatusSchema>;

export const RetentionClassPolicySchema = z
  .object({
    dataClass: PrivacyDataClassSchema,
    action: RetentionActionSchema,
    /** Calendar days; null until [HUMANO] Colombia approval. */
    retentionDays: z.number().int().nonnegative().nullable(),
    legalBasis: z.string().min(1).max(500),
    legalStatus: LegalStatusSchema,
  })
  .strict();
export type RetentionClassPolicy = z.infer<typeof RetentionClassPolicySchema>;

export const RetentionPolicyStatusSchema = z.enum([
  'draft',
  'active',
  'superseded',
  'disabled',
]);
export type RetentionPolicyStatus = z.infer<typeof RetentionPolicyStatusSchema>;

export const RetentionPolicySchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    status: RetentionPolicyStatusSchema,
    classes: z.array(RetentionClassPolicySchema).min(1),
    createdAt: z.string().datetime(),
    activatedAt: z.string().datetime().nullable(),
    note: z.string().max(1000).nullable(),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const CreateRetentionPolicyBodySchema = z
  .object({
    classes: z.array(RetentionClassPolicySchema).min(1),
    note: z.string().max(1000).optional(),
    currentPassword: z.string().min(1),
  })
  .strict();
export type CreateRetentionPolicyBody = z.infer<
  typeof CreateRetentionPolicyBodySchema
>;

export const ActivateRetentionPolicyBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    confirmIrreversible: z.literal(true),
  })
  .strict();
export type ActivateRetentionPolicyBody = z.infer<
  typeof ActivateRetentionPolicyBodySchema
>;

export const RetentionRunModeSchema = z.enum(['dry_run', 'execute']);
export type RetentionRunMode = z.infer<typeof RetentionRunModeSchema>;

export const RetentionRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type RetentionRunStatus = z.infer<typeof RetentionRunStatusSchema>;

export const RetentionClassProgressSchema = z
  .object({
    dataClass: PrivacyDataClassSchema,
    action: RetentionActionSchema,
    candidateCount: z.number().int().nonnegative(),
    processedCount: z.number().int().nonnegative(),
    sampleOpaqueIds: z.array(z.string()).max(10),
  })
  .strict();
export type RetentionClassProgress = z.infer<
  typeof RetentionClassProgressSchema
>;

export const RetentionReportSchema = z
  .object({
    runId: z.string().uuid(),
    policyId: z.string().uuid(),
    policyVersion: z.number().int().positive(),
    mode: RetentionRunModeSchema,
    finishedAt: z.string().datetime(),
    classes: z.array(RetentionClassProgressSchema),
    signature: z.string().min(1),
  })
  .strict();
export type RetentionReport = z.infer<typeof RetentionReportSchema>;

export const RetentionRunSchema = z
  .object({
    id: z.string().uuid(),
    policyId: z.string().uuid(),
    policyVersion: z.number().int().positive(),
    mode: RetentionRunModeSchema,
    status: RetentionRunStatusSchema,
    progress: z.array(RetentionClassProgressSchema),
    report: RetentionReportSchema.nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
  })
  .strict();
export type RetentionRun = z.infer<typeof RetentionRunSchema>;

export const StartRetentionRunBodySchema = z
  .object({
    mode: RetentionRunModeSchema,
    currentPassword: z.string().min(1),
    /** Required for execute mode. */
    confirmIrreversible: z.literal(true).optional(),
    batchSize: z.number().int().min(1).max(500).optional(),
  })
  .strict();
export type StartRetentionRunBody = z.infer<typeof StartRetentionRunBodySchema>;

export const PrivacyInventoryItemSchema = z
  .object({
    dataClass: PrivacyDataClassSchema,
    tables: z.array(z.string().min(1)),
    piiFields: z.array(z.string().min(1)),
    relationshipStrategy: z.string().min(1),
    allowedActions: z.array(RetentionActionSchema).min(1),
  })
  .strict();
export type PrivacyInventoryItem = z.infer<typeof PrivacyInventoryItemSchema>;

export const PrivacyInventoryResponseSchema = z
  .object({
    data: z.object({
      items: z.array(PrivacyInventoryItemSchema),
      capabilityNote: z.literal(
        'security:manage for activate/execute; audit:read for reports',
      ),
      legalDurationsStatus: z.literal('[HUMANO]'),
    }),
  })
  .strict();

export const RetentionPolicyListResponseSchema = z
  .object({
    data: z.object({
      items: z.array(RetentionPolicySchema),
    }),
  })
  .strict();

export const RetentionPolicyResponseSchema = z
  .object({
    data: z.object({
      policy: RetentionPolicySchema,
    }),
  })
  .strict();

export const RetentionRunListResponseSchema = z
  .object({
    data: z.object({
      items: z.array(RetentionRunSchema),
    }),
  })
  .strict();

export const RetentionRunResponseSchema = z
  .object({
    data: z.object({
      run: RetentionRunSchema,
    }),
  })
  .strict();

export const DataSubjectRequestKindSchema = z.enum(['export', 'anonymize']);
export type DataSubjectRequestKind = z.infer<
  typeof DataSubjectRequestKindSchema
>;

export const DataSubjectPreviewBodySchema = z
  .object({
    kind: DataSubjectRequestKindSchema,
    /** Customer phone used only for lookup; never returned or audited raw. */
    customerPhone: z.string().min(7).max(20),
    currentPassword: z.string().min(1),
  })
  .strict();
export type DataSubjectPreviewBody = z.infer<
  typeof DataSubjectPreviewBodySchema
>;

export const DataSubjectExecuteBodySchema = z
  .object({
    kind: DataSubjectRequestKindSchema,
    customerPhone: z.string().min(7).max(20),
    currentPassword: z.string().min(1),
    confirmIrreversible: z.literal(true),
  })
  .strict();
export type DataSubjectExecuteBody = z.infer<
  typeof DataSubjectExecuteBodySchema
>;

export const DataSubjectPreviewSchema = z
  .object({
    kind: DataSubjectRequestKindSchema,
    customerOpaqueId: z.string().min(1),
    relatedCounts: z.record(z.string(), z.number().int().nonnegative()),
    /** Opaque record IDs only — never names, phones, bodies. */
    sampleOpaqueIds: z.array(z.string()).max(20),
  })
  .strict();
export type DataSubjectPreview = z.infer<typeof DataSubjectPreviewSchema>;

export const DataSubjectPreviewResponseSchema = z
  .object({
    data: z.object({
      preview: DataSubjectPreviewSchema,
    }),
  })
  .strict();

export const DataSubjectResultSchema = z
  .object({
    kind: DataSubjectRequestKindSchema,
    customerOpaqueId: z.string().min(1),
    relatedCounts: z.record(z.string(), z.number().int().nonnegative()),
    exportPayload: z
      .object({
        orders: z.array(
          z
            .object({
              opaqueId: z.string(),
              status: z.string(),
              createdAt: z.string().datetime(),
            })
            .strict(),
        ),
        messageCounts: z
          .object({
            inbound: z.number().int().nonnegative(),
            conversation: z.number().int().nonnegative(),
            outbound: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DataSubjectResult = z.infer<typeof DataSubjectResultSchema>;

export const DataSubjectResultResponseSchema = z
  .object({
    data: z.object({
      result: DataSubjectResultSchema,
    }),
  })
  .strict();
