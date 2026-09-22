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
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { AlertService } from '../src/modules/alerts/alert-service.js';
import { PostgresAlertRepository } from '../src/modules/alerts/postgres-alert-repository.js';
import { IntegrationHealthService } from '../src/modules/integrations/integration-health-service.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

describe('admin authorization', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let app: FastifyInstance;
  let ownerCookie: string;
  let operatorCookie: string;

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
          owner_alert_deliveries,
          owner_alerts,
          admin_mfa_recovery_codes,
          admin_mfa_secrets,
          admin_sessions,
          admin_users
        RESTART IDENTITY CASCADE
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  async function login(username: string, password: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username, password },
    });
    expect(response.statusCode).toBe(200);
    return cookieFromResponse(response.headers['set-cookie']);
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
      alertService: new AlertService(new PostgresAlertRepository(database)),
      integrationHealthService: new IntegrationHealthService({
        database: async () => {
          await database.ping();
        },
        mediaStorage: async () => undefined,
        whatsappConfigured: false,
        shippingConfigured: false,
        schedulerHealthy: true,
      }),
    });
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = wrapDatabase(createPostgresDatabase(testDatabaseUrl));
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-authz-'));
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
    await authService.createUser(
      'owner',
      'password1234',
      'password1234',
      'owner',
    );
    await authService.createUser(
      'operator',
      'password1234',
      'password1234',
      'operator',
    );
    ownerCookie = await login('owner', 'password1234');
    operatorCookie = await login('operator', 'password1234');
  });

  it('returns 401 for unauthenticated sensitive routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/security/users',
      headers: { origin: adminOrigin },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when an authenticated operator hits owner-only routes', async () => {
    const security = await app.inject({
      method: 'GET',
      url: '/api/admin/security/users',
      headers: { origin: adminOrigin, cookie: operatorCookie },
    });
    expect(security.statusCode).toBe(403);
    expect(security.json()).toMatchObject({
      error: { code: 'authorization_denied' },
    });

    const integrations = await app.inject({
      method: 'GET',
      url: '/api/admin/integrations/health',
      headers: { origin: adminOrigin, cookie: operatorCookie },
    });
    expect(integrations.statusCode).toBe(403);
  });

  it('allows owners on security and integrations routes', async () => {
    const security = await app.inject({
      method: 'GET',
      url: '/api/admin/security/users',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(security.statusCode).toBe(200);
    expect(security.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'owner', role: 'owner' }),
        expect.objectContaining({ username: 'operator', role: 'operator' }),
      ]),
    );

    const integrations = await app.inject({
      method: 'GET',
      url: '/api/admin/integrations/health',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(integrations.statusCode).toBe(200);
  });

  it('allows operators on operational routes', async () => {
    const alerts = await app.inject({
      method: 'GET',
      url: '/api/admin/alerts',
      headers: { origin: adminOrigin, cookie: operatorCookie },
    });
    expect(alerts.statusCode).toBe(200);

    const references = await app.inject({
      method: 'GET',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie: operatorCookie },
    });
    expect(references.statusCode).toBe(200);
  });

  it('creates operators with password confirmation and never returns hashes', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/security/users',
      headers: { origin: adminOrigin, cookie: ownerCookie },
      payload: {
        username: 'ops_new',
        password: 'password1234',
        passwordConfirmation: 'password1234',
        role: 'operator',
        currentPassword: 'password1234',
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.data.user).toMatchObject({
      username: 'ops_new',
      role: 'operator',
    });
    expect(JSON.stringify(body)).not.toMatch(/password_hash|scrypt\$/i);
  });
});
