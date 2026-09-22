import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { GlobalSearchService } from '../src/modules/search/global-search-service.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl,
  adminOrigin,
  logLevel: 'silent',
  mediaRoot: './var/media',
  storageDriver: 'local',
};

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) throw new Error('Missing Set-Cookie');
  return value.split(';')[0]!;
}

describe('global search HTTP', () => {
  let app: FastifyInstance;
  let mediaRoot: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-search-'));
    const database = createPostgresDatabase(databaseUrl);
    const authService = new AuthService(
      new PostgresAdminAuthRepository(database),
    );
    await authService.createUser('searcher', 'password1234', 'password1234');
    const catalogRepository = new PostgresCatalogRepository(database);
    const photoStorage = new LocalPhotoStorage(mediaRoot);
    app = await buildApp({
      config: { ...config, mediaRoot },
      database,
      authService,
      catalogService: new DefaultCatalogService(
        catalogRepository,
        photoStorage,
      ),
      photoStorage,
      globalSearchService: new GlobalSearchService(database),
    });
  });

  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE sales_orders, whatsapp_conversations, catalog_references CASCADE`;
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Tenis Search', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (id, reference_id, size, quantity, customer_name, customer_phone, status)
        VALUES (
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          37, 1, 'Ana Busqueda', '+573001112233', 'confirmed'
        )
      `;
      await sql`
        INSERT INTO whatsapp_conversations (id, customer_phone, state, mode, last_inbound_message_at)
        VALUES (
          '33333333-3333-4333-8333-333333333333',
          '+573009998877',
          'awaiting_size',
          'bot',
          clock_timestamp()
        )
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginCookie(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'searcher', password: 'password1234' },
    });
    expect(response.statusCode).toBe(200);
    return cookieFromResponse(response.headers['set-cookie']);
  }

  it('searches orders, conversations and references without paging client-side', async () => {
    const cookie = await loginCookie();
    const byName = await app.inject({
      method: 'GET',
      url: '/api/admin/search?q=Busqueda',
      headers: { cookie, origin: adminOrigin },
    });
    expect(byName.statusCode).toBe(200);
    expect(byName.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'order',
          label: expect.stringContaining('Ana Busqueda'),
        }),
      ]),
    );

    const byPhone = await app.inject({
      method: 'GET',
      url: '/api/admin/search?q=9998877',
      headers: { cookie, origin: adminOrigin },
    });
    expect(byPhone.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'conversation',
          label: '+573009998877',
        }),
      ]),
    );

    const byReference = await app.inject({
      method: 'GET',
      url: '/api/admin/search?q=Tenis',
      headers: { cookie, origin: adminOrigin },
    });
    expect(byReference.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reference',
          label: '01 · Tenis Search · Negro',
        }),
      ]),
    );
  });

  it('rejects short queries', async () => {
    const cookie = await loginCookie();
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/search?q=a',
      headers: { cookie, origin: adminOrigin },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
