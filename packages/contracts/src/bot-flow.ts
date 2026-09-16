import { z } from 'zod';

export const BotFlowStepKeys = [
  'welcome',
  'size',
  'catalog',
  'reference',
  'name',
  'phone',
  'department',
  'locality',
  'address',
  'notes',
  'quote',
  'summary',
  'confirmation',
  'guide',
  'complete',
  'human',
] as const;
export function botFlowVariablesForStep(
  step: (typeof BotFlowStepKeys)[number],
): readonly string[] {
  const index = BotFlowStepKeys.indexOf(step);
  if (step === 'human') return [];
  return [
    ...(index >= 2 ? ['talla'] : []),
    ...(index >= 4 ? ['referencia', 'pedido'] : []),
    ...(index >= 5 ? ['nombre'] : []),
    ...(index >= 11 ? ['total', 'transportadora'] : []),
  ];
}
const StepSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().max(4096),
    invalidMessage: z.string().max(4096).optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export const BotFlowDefinitionSchema = z
  .object({
    commands: z
      .object({
        human: z.string().trim().min(1).max(40),
        reset: z.string().trim().min(1).max(40),
        more: z.string().trim().min(1).max(40),
        confirm: z.string().trim().min(1).max(40),
        cancel: z.string().trim().min(1).max(40),
      })
      .strict(),
    pageSize: z.number().int().min(1).max(10),
    steps: z.record(z.enum(BotFlowStepKeys), StepSchema),
    optionalSteps: z
      .object({
        notes: z.boolean(),
        showCarrierInSummary: z.boolean(),
        sendGuideToCustomer: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const BotFlowDraftBodySchema = z
  .object({
    revision: z.number().int().nonnegative(),
    definition: BotFlowDefinitionSchema,
  })
  .strict();
export const BotFlowVersionSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    definition: BotFlowDefinitionSchema,
    createdAt: z.iso.datetime(),
    author: z.string(),
  })
  .strict();
export const BotFlowStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    definition: BotFlowDefinitionSchema,
    activeVersionId: z.uuid().nullable(),
    versions: z.array(BotFlowVersionSchema),
  })
  .strict();
export const BotFlowStateResponseSchema = z
  .object({ data: BotFlowStateSchema })
  .strict();
export const BotFlowSimulationBodySchema = z
  .object({
    definition: BotFlowDefinitionSchema,
    messages: z.array(z.string().max(4096)).min(1).max(100),
    scenario: z
      .enum([
        'available',
        'out_of_stock',
        'invalid_locality',
        'blocked_carrier',
        'fallback',
        'expired_quote',
      ])
      .default('available'),
  })
  .strict();
