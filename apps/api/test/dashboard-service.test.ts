import { describe, expect, it, vi } from 'vitest';

import { DashboardService } from '../src/modules/dashboard/dashboard-service.js';

describe('DashboardService', () => {
  it('queries the Bogotá business day and returns a generated timestamp', async () => {
    const repository = {
      getSummary: vi.fn().mockResolvedValue({
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
      }),
    };
    const now = new Date('2026-09-10T15:00:00.000Z');
    const service = new DashboardService(repository, () => now);

    const result = await service.getSummary();

    expect(repository.getSummary).toHaveBeenCalledWith(
      new Date('2026-09-10T05:00:00.000Z'),
      new Date('2026-09-11T05:00:00.000Z'),
    );
    expect(result.generatedAt).toBe('2026-09-10T15:00:00.000Z');
  });

  it('aggregates a requested seven-day operational range', async () => {
    const repository = { getSummary: vi.fn().mockResolvedValue({}) };
    const service = new DashboardService(
      repository as never,
      () => new Date('2026-09-10T15:00:00.000Z'),
    );

    await service.getSummary('7d');

    expect(repository.getSummary).toHaveBeenCalledWith(
      new Date('2026-09-04T05:00:00.000Z'),
      new Date('2026-09-11T05:00:00.000Z'),
    );
  });
});
