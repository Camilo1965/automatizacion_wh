import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import { AuthenticationRequiredError } from '../src/modules/auth/auth-errors.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import { CustomerService } from '../src/modules/customers/customer-service.js';
import type { CustomerRepository } from '../src/modules/customers/postgres-customer-repository.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
  storageDriver: 'local',
};
const customerId = '11111111-1111-4111-8111-111111111111';

describe('admin customer HTTP API', () => {
  it('requires a session, validates filters, and projects only minimal customer data', async () => {
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: customerId,
          displayName: 'Ana',
          normalizedPhone: '+573001111111',
          segment: 'buyer',
          marketingConsent: 'unknown',
          lastActivityAt: new Date('2026-09-22T12:00:00Z'),
          createdAt: new Date('2026-09-20T10:00:00Z'),
          marketingConsentEvidenceRef: 'must-not-leak',
        },
      ],
      nextCursor: null,
    });
    const repository: CustomerRepository = {
      list,
      get: vi.fn().mockResolvedValue(null),
      reconciliation: vi
        .fn()
        .mockResolvedValue({ orders: [], conversations: [] }),
    };
    const authService = {
      getSession: async (token: string | undefined) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'operator',
          role: 'operator' as const,
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
      customerService: new CustomerService(repository),
    });
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/api/admin/customers' }))
          .statusCode,
      ).toBe(401);
      const headers = { cookie: 'camila_admin_session=good' };
      for (const query of [
        '?limit=101',
        '?limit=no',
        '?segment=paid',
        '?cursor=bad',
        '?unexpected=1',
        `?cursor=${Buffer.from(JSON.stringify({ createdAt: '2026-02-30T10:00:00.123456Z', id: customerId })).toString('base64url')}`,
      ]) {
        expect(
          (
            await app.inject({
              method: 'GET',
              url: `/api/admin/customers${query}`,
              headers,
            })
          ).statusCode,
        ).toBe(400);
      }
      expect(list).not.toHaveBeenCalled();
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/customers?segment=buyer&limit=10',
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.items[0]).toEqual({
        id: customerId,
        displayName: 'Ana',
        normalizedPhone: '+573001111111',
        segment: 'buyer',
        marketingConsent: 'unknown',
        lastActivityAt: '2026-09-22T12:00:00.000Z',
        createdAt: '2026-09-20T10:00:00.000Z',
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/admin/customers/${customerId}`,
            headers,
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('authenticates and bounds the read-only reconciliation queue', async () => {
    const ordersNext = {
      createdAt: '2026-09-22T12:00:00.123456Z',
      id: '22222222-2222-4222-8222-222222222222',
    };
    const conversationsNext = {
      createdAt: '2026-09-22T12:00:00.123455Z',
      id: '33333333-3333-4333-8333-333333333333',
    };
    const reconciliation = vi.fn().mockResolvedValue({
      orders: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          orderNumber: 'PED-000001',
          customerName: 'Ana',
          customerPhone: null,
          status: 'draft',
          createdAt: new Date('2026-09-22T12:00:00Z'),
          href: '/orders/22222222-2222-4222-8222-222222222222',
          address: 'secret',
        },
      ],
      conversations: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          customerPhone: '+573009999999',
          state: 'idle',
          createdAt: new Date('2026-09-22T11:00:00Z'),
          href: '/conversations?conversation=33333333-3333-4333-8333-333333333333',
        },
      ],
      ordersNextCursor: ordersNext,
      conversationsNextCursor: conversationsNext,
    });
    const repository = {
      list: vi.fn(),
      get: vi.fn(),
      reconciliation,
    } as unknown as CustomerRepository;
    const authService = {
      getSession: async (token: string | undefined) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'owner',
          role: 'owner' as const,
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
      customerService: new CustomerService(repository),
    });
    try {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/admin/customers/reconciliation',
          })
        ).statusCode,
      ).toBe(401);
      const headers = { cookie: 'camila_admin_session=good' };
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/admin/customers/reconciliation?limit=101',
            headers,
          })
        ).statusCode,
      ).toBe(400);
      for (const cursor of [
        'bad',
        Buffer.from(
          JSON.stringify({
            createdAt: '2026-02-30T10:00:00.123456Z',
            id: customerId,
          }),
        ).toString('base64url'),
      ]) {
        expect(
          (
            await app.inject({
              method: 'GET',
              url: `/api/admin/customers/reconciliation?ordersCursor=${cursor}`,
              headers,
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await app.inject({
              method: 'GET',
              url: `/api/admin/customers/reconciliation?conversationsCursor=${cursor}`,
              headers,
            })
          ).statusCode,
        ).toBe(400);
      }
      expect(reconciliation).not.toHaveBeenCalled();
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/admin/customers/reconciliation?kind=other',
            headers,
          })
        ).statusCode,
      ).toBe(400);
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/customers/reconciliation?limit=1',
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(reconciliation).toHaveBeenCalledWith({ limit: 1, kind: 'all' });
      expect(response.json().data.ordersNextCursor).toEqual(expect.any(String));
      expect(response.json().data.conversationsNextCursor).toEqual(
        expect.any(String),
      );
      expect(response.json().data.orders[0]).toEqual({
        id: '22222222-2222-4222-8222-222222222222',
        orderNumber: 'PED-000001',
        customerName: 'Ana',
        customerPhone: null,
        status: 'draft',
        createdAt: '2026-09-22T12:00:00.000Z',
        href: '/orders/22222222-2222-4222-8222-222222222222',
      });
      const second = await app.inject({
        method: 'GET',
        url: `/api/admin/customers/reconciliation?limit=1&ordersCursor=${response.json().data.ordersNextCursor}&conversationsCursor=${response.json().data.conversationsNextCursor}`,
        headers,
      });
      expect(second.statusCode).toBe(200);
      expect(reconciliation).toHaveBeenLastCalledWith({
        limit: 1,
        kind: 'all',
        ordersAfter: ordersNext,
        conversationsAfter: conversationsNext,
      });
      const ordersOnly = await app.inject({
        method: 'GET',
        url: '/api/admin/customers/reconciliation?kind=orders&limit=1',
        headers,
      });
      expect(ordersOnly.statusCode).toBe(200);
      expect(reconciliation).toHaveBeenLastCalledWith({
        limit: 1,
        kind: 'orders',
      });
      expect(ordersOnly.json().data.conversations).toEqual([]);
      expect(ordersOnly.json().data.conversationsNextCursor).toBeNull();
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/admin/customers/reconciliation',
            headers: { ...headers, origin: config.adminOrigin },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
