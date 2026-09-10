import { describe, expect, it } from 'vitest';
import {
  IntegrationHealthResponseSchema,
  InventoryClosureResponseSchema,
  OwnerAlertsResponseSchema,
} from '../src/operations.js';

describe('operations contracts', () => {
  it('validates alerts, closures and secret-free health', () => {
    expect(
      OwnerAlertsResponseSchema.safeParse({
        data: { items: [], nextCursor: null },
      }).success,
    ).toBe(true);
    expect(
      InventoryClosureResponseSchema.safeParse({
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          businessDate: '2026-09-10',
          version: 1,
          profile: 'adjustments',
          status: 'generated',
          movementCount: 2,
          totalUnits: -2,
          checksum: 'a'.repeat(64),
          createdAt: '2026-09-10T19:00:00.000Z',
          acknowledgedAt: null,
        },
      }).success,
    ).toBe(true);
    expect(
      IntegrationHealthResponseSchema.safeParse({
        data: {
          database: {
            status: 'up',
            checkedAt: '2026-09-10T19:00:00.000Z',
            detail: null,
          },
          mediaStorage: {
            status: 'up',
            checkedAt: '2026-09-10T19:00:00.000Z',
            detail: null,
          },
          whatsapp: {
            status: 'degraded',
            checkedAt: '2026-09-10T19:00:00.000Z',
            detail: 'Coexistencia pendiente',
          },
          shipping: {
            status: 'up',
            checkedAt: '2026-09-10T19:00:00.000Z',
            detail: null,
          },
          scheduler: {
            status: 'up',
            checkedAt: '2026-09-10T19:00:00.000Z',
            detail: null,
          },
        },
      }).success,
    ).toBe(true);
  });
});
