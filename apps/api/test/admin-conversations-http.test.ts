import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import { AuthenticationRequiredError } from '../src/modules/auth/auth-errors.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
};

describe('admin conversation HTTP API', () => {
  it('requires the owner session and allows taking control', async () => {
    const takeControl = vi.fn().mockResolvedValue(undefined);
    const repository = {
      list: vi
        .fn()
        .mockResolvedValue([
          {
            id: '11111111-1111-4111-8111-111111111111',
            customerPhone: '+573001234567',
            mode: 'bot',
            state: 'awaiting_size',
            pendingOutbound: 1,
          },
        ]),
      get: vi
        .fn()
        .mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          customerPhone: '+573001234567',
          mode: 'human',
          state: 'awaiting_size',
          pendingOutbound: 0,
        }),
      takeControl,
      releaseControl: vi.fn(),
    };
    const authService = {
      getSession: async (token: string | undefined) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'camila',
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
      conversationAdminRepository: repository,
    });
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/conversations',
    });
    expect(anonymous.statusCode).toBe(401);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/conversations',
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items).toHaveLength(1);
    const take = await app.inject({
      method: 'POST',
      url: '/api/admin/conversations/11111111-1111-4111-8111-111111111111/take-control',
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
    });
    expect(take.statusCode).toBe(200);
    expect(takeControl).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    await app.close();
  });
});
