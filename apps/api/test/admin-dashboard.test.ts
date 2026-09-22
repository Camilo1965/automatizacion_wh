import { describe, expect, it, vi } from 'vitest';

import { DashboardResponseSchema } from '@camila/contracts';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import { AuthenticationRequiredError } from '../src/modules/auth/auth-errors.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import type { DashboardService } from '../src/modules/dashboard/dashboard-service.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://test',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
  storageDriver: 'local',
};

describe('admin dashboard HTTP', () => {
  it('requires a session and returns the strict dashboard envelope', async () => {
    const getSummary = vi.fn().mockResolvedValue({
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
    const authService = {
      getSession: async (token?: string) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'owner',
          role: 'owner',
        };
      },
    } as unknown as AuthService;
    const app = await buildApp({
      config,
      database: {
        orm: {} as PostgresDatabase['orm'],
        ping: vi.fn(),
        close: vi.fn(),
      },
      authService,
      catalogService: {} as CatalogService,
      photoStorage: {} as PhotoStorage,
      dashboardService: { getSummary } as unknown as DashboardService,
    });

    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/dashboard' }))
        .statusCode,
    ).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard',
      headers: { cookie: 'camila_admin_session=good' },
    });

    expect(response.statusCode).toBe(200);
    expect(
      DashboardResponseSchema.parse(response.json()).data.queues
        .readyToDispatch,
    ).toBe(3);
    expect(getSummary).toHaveBeenCalledOnce();
    await app.close();
  });
});
