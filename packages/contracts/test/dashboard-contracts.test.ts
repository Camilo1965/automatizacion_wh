import { describe, expect, it } from 'vitest';

import { DashboardSummarySchema } from '../src/index';

describe('dashboard contracts', () => {
  it('accepts a strict operational dashboard summary', () => {
    const result = DashboardSummarySchema.parse({
      queues: {
        conversations: 2,
        guideIncidents: 1,
        readyToDispatch: 3,
        awaitingConfirmation: 4,
        closurePending: false,
        lowStockReferences: 5,
        integrationFailures: 0,
      },
      today: {
        newConversations: 7,
        confirmedOrders: 4,
        dispatchedOrders: 2,
        codValueCop: 480000,
        guidesCreated: 3,
        reservedUnits: 4,
        averageFirstResponseSeconds: null,
      },
      generatedAt: '2026-09-10T15:00:00.000Z',
    });

    expect(result.queues.readyToDispatch).toBe(3);
  });

  it('rejects unknown fields and negative counters', () => {
    const invalid = {
      queues: {
        conversations: -1,
        guideIncidents: 0,
        readyToDispatch: 0,
        awaitingConfirmation: 0,
        closurePending: false,
        lowStockReferences: 0,
        integrationFailures: 0,
      },
      today: {
        newConversations: 0,
        confirmedOrders: 0,
        dispatchedOrders: 0,
        codValueCop: 0,
        guidesCreated: 0,
        reservedUnits: 0,
        averageFirstResponseSeconds: null,
      },
      generatedAt: '2026-09-10T15:00:00.000Z',
      extra: true,
    };

    expect(DashboardSummarySchema.safeParse(invalid).success).toBe(false);
  });
});
