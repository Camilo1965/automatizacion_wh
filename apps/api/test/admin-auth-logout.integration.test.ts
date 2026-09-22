import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { ADMIN_SESSION_COOKIE } from '../src/http/session-cookie.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

describe('admin logout authentication', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let app: FastifyInstance;

  function wrapDatabase(inner: PostgresDatabase): PostgresDatabase {
    return {
      get orm() {
        return inner.orm;
      },
      ping: () => inner.ping(),
      close: async () => {
        if (allowDatabaseClose) {
          await inner.close();
        }
      },
    };
  }

  async function resetTables(): Promise<void> {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        TRUNCATE TABLE
          admin_sessions,
          admin_users,
          inventory_movements,
          catalog_stock,
          catalog_references
        RESTART IDENTITY CASCADE
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  async function buildTestApp(): Promise<void> {
    if (app !== undefined) {
      await app.close();
    }

    const config: AppConfig = {
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: testDatabaseUrl,
      adminOrigin,
      logLevel: 'silent',
      mediaRoot,
      storageDriver: 'local',
    };

    const photoStorage = new LocalPhotoStorage(mediaRoot);
    app = await buildApp({
      config,
      database,
      authService,
      catalogService: new DefaultCatalogService(
        new PostgresCatalogRepository(database),
        photoStorage,
      ),
      photoStorage,
    });
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = wrapDatabase(createPostgresDatabase(testDatabaseUrl));
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-logout-'));
    authService = new AuthService(new PostgresAdminAuthRepository(database));
    await buildTestApp();
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetTables();
    await buildTestApp();
    await authService.createUser('camila', 'password1234', 'password1234');
  });

  it('rejects anonymous logout with 401 authentication_required', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: {
        origin: adminOrigin,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: 'authentication_required',
        message: 'Authentication required',
      },
    });
  });

  it('rejects logout with tampered cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: {
        origin: adminOrigin,
        cookie: `${ADMIN_SESSION_COOKIE}=not-a-valid-token`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('authentication_required');
  });

  it('logs out with valid session then rejects reuse', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    const cookie = cookieFromResponse(login.headers['set-cookie']);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { origin: adminOrigin, cookie },
    });
    expect(logout.statusCode).toBe(204);

    const again = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { origin: adminOrigin, cookie },
    });
    expect(again.statusCode).toBe(401);
    expect(again.json().error.code).toBe('authentication_required');
  });
});
