import { z } from 'zod';

const counter = z.number().int().nonnegative();

export const DashboardSummarySchema = z
  .object({
    queues: z
      .object({
        conversations: counter,
        guideIncidents: counter,
        readyToDispatch: counter,
        awaitingConfirmation: counter,
        closurePending: z.boolean(),
        lowStockReferences: counter,
        integrationFailures: counter,
      })
      .strict(),
    today: z
      .object({
        newConversations: counter,
        confirmedOrders: counter,
        dispatchedOrders: counter,
        codValueCop: counter,
        guidesCreated: counter,
        reservedUnits: counter,
        averageFirstResponseSeconds: counter.nullable(),
      })
      .strict(),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export const DashboardResponseSchema = z
  .object({ data: DashboardSummarySchema })
  .strict();

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
