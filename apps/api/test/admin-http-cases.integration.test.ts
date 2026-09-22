import { createHash, randomBytes } from 'node:crypto';
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
const missingId = '11111111-1111-4111-8111-111111111111';

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

describe('admin HTTP explicit cases', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let catalogService: DefaultCatalogService;
  let app: FastifyInstance;
  let cookie: string;
  let referenceId: string;

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
    catalogService = new DefaultCatalogService(
      new PostgresCatalogRepository(database),
      photoStorage,
    );
    app = await buildApp({
      config,
      database,
      authService,
      catalogService,
      photoStorage,
    });
  }

  async function login(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    expect(response.statusCode).toBe(200);
    return cookieFromResponse(response.headers['set-cookie']);
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = wrapDatabase(createPostgresDatabase(testDatabaseUrl));
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-http-cases-'));
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
    cookie = await login();
    const created = await catalogService.createReference({
      code: '01',
      modelName: 'Ballerina',
      color: 'Negro',
      priceCop: 120_000,
    });
    referenceId = created.id;
  });

  it('rejects invalid UUID params with 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/references/not-a-uuid',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
  });

  it('returns 404 for missing reference', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${missingId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('rejects unknown JSON fields and empty PATCH', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie },
      payload: {
        code: '02',
        modelName: 'X',
        color: 'Rojo',
        priceCop: 10_000,
        extra: true,
      },
    });
    expect(unknown.statusCode).toBe(400);

    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/references/${referenceId}`,
      headers: { origin: adminOrigin, cookie },
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);
  });

  it('activate and deactivate are idempotent', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/deactivate`,
      headers: { origin: adminOrigin, cookie },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/deactivate`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.active).toBe(false);

    const a1 = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/activate`,
      headers: { origin: adminOrigin, cookie },
    });
    const a2 = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/activate`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(a1.json().data.active).toBe(true);
    expect(a2.json().data.active).toBe(true);
  });

  it('paginates references without duplicates and sorts available sizes', async () => {
    for (const code of ['02', '03', '04']) {
      await catalogService.createReference({
        code,
        modelName: `M${code}`,
        color: 'Azul',
        priceCop: 50_000,
      });
    }
    await catalogService.setPhysicalStock({
      referenceId,
      size: '38',
      physicalQuantity: 1,
      note: 'talla 38',
    });
    await catalogService.setPhysicalStock({
      referenceId,
      size: '36',
      physicalQuantity: 2,
      note: 'talla 36',
    });
    await catalogService.setPhysicalStock({
      referenceId,
      size: '37',
      physicalQuantity: 3,
      note: 'talla 37',
    });

    const page1 = await app.inject({
      method: 'GET',
      url: '/api/admin/references?status=all&limit=2',
      headers: { cookie },
    });
    expect(page1.statusCode).toBe(200);
    const items1 = page1.json().data.items as Array<{ code: string }>;
    expect(items1).toHaveLength(2);
    const after = page1.json().data.nextAfterCode as string;
    expect(after).toBeTruthy();

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/admin/references?status=all&limit=2&afterCode=${encodeURIComponent(after)}`,
      headers: { cookie },
    });
    const items2 = page2.json().data.items as Array<{ code: string }>;
    const codes = [...items1, ...items2].map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/references?status=all&query=01',
      headers: { cookie },
    });
    const summary = list.json().data.items[0] as {
      availableSizes: string[];
    };
    expect(summary.availableSizes).toEqual(['36', '37', '38']);
  });

  it('stock no-op creates no movement; invalid cursor rejected', async () => {
    await catalogService.setPhysicalStock({
      referenceId,
      size: '37',
      physicalQuantity: 4,
      note: 'inicial',
    });
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    let beforeCount: number;
    try {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM inventory_movements
        WHERE reference_id = ${referenceId}::uuid
      `;
      beforeCount = Number(rows[0]!.count);
    } finally {
      await sql.end({ timeout: 5 });
    }

    const noop = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/37`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 4, note: 'sin cambio' },
    });
    expect(noop.statusCode).toBe(200);

    const sql2 = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const rows = await sql2<{ count: string }[]>`
        SELECT count(*)::text AS count FROM inventory_movements
        WHERE reference_id = ${referenceId}::uuid
      `;
      expect(Number(rows[0]!.count)).toBe(beforeCount);
    } finally {
      await sql2.end({ timeout: 5 });
    }

    const badCursor = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/movements?cursor=not-valid`,
      headers: { cookie },
    });
    expect(badCursor.statusCode).toBe(400);
    expect(badCursor.json().error.code).toBe('invalid_cursor');
  });

  it('rejects inactive login and expired, revoked, or tampered sessions', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`UPDATE admin_users SET active = false`;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const inactiveLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    expect(inactiveLogin.statusCode).toBe(401);
    expect(inactiveLogin.json().error.code).toBe('invalid_credentials');

    await resetTables();
    await authService.createUser('camila', 'password1234', 'password1234');
    cookie = await login();

    const tampered = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=tampered-token-value` },
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json().error.code).toBe('authentication_required');

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const sqlExpire = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const userRows = await sqlExpire<{ id: string }[]>`
        SELECT id FROM admin_users WHERE username = 'camila'
      `;
      const userId = userRows[0]!.id;
      await sqlExpire`
        INSERT INTO admin_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
        VALUES (
          gen_random_uuid(),
          ${userId}::uuid,
          ${tokenHash},
          now() - interval '13 hours',
          now() - interval '1 hour',
          NULL
        )
      `;
    } finally {
      await sqlExpire.end({ timeout: 5 });
    }

    const expired = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${rawToken}` },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe('authentication_required');

    const activeCookie = await login();
    await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { origin: adminOrigin, cookie: activeCookie },
    });
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { cookie: activeCookie },
    });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json().error.code).toBe('authentication_required');
  });

  it('rejects anonymous access on all admin routes with 401 not 403', async () => {
    const routes: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'PATCH';
      url: string;
      payload?: unknown;
    }> = [
      { method: 'GET', url: '/api/admin/auth/session' },
      { method: 'POST', url: '/api/admin/auth/logout', payload: {} },
      { method: 'GET', url: '/api/admin/references' },
      {
        method: 'POST',
        url: '/api/admin/references',
        payload: {
          code: '99',
          modelName: 'X',
          color: 'Y',
          priceCop: 1000,
        },
      },
      { method: 'GET', url: `/api/admin/references/${referenceId}` },
      {
        method: 'PATCH',
        url: `/api/admin/references/${referenceId}`,
        payload: { modelName: 'Z' },
      },
      {
        method: 'POST',
        url: `/api/admin/references/${referenceId}/activate`,
      },
      {
        method: 'POST',
        url: `/api/admin/references/${referenceId}/deactivate`,
      },
      {
        method: 'PUT',
        url: `/api/admin/references/${referenceId}/photo`,
      },
      { method: 'GET', url: `/api/admin/references/${referenceId}/photo` },
      {
        method: 'PUT',
        url: `/api/admin/references/${referenceId}/stock/37`,
        payload: { physicalQuantity: 1, note: 'abc' },
      },
      {
        method: 'GET',
        url: `/api/admin/references/${referenceId}/movements`,
      },
    ];

    for (const route of routes) {
      const headers: Record<string, string> = {};
      if (route.method !== 'GET') {
        headers.origin = adminOrigin;
      }

      let response;
      if (route.payload === undefined) {
        response = await app.inject({
          method: route.method,
          url: route.url,
          headers,
        });
      } else {
        headers['content-type'] = 'application/json';
        response = await app.inject({
          method: route.method,
          url: route.url,
          headers,
          payload: route.payload as Record<string, unknown>,
        });
      }

      expect(
        response.statusCode,
        `${route.method} ${route.url} → ${JSON.stringify(response.json())}`,
      ).toBe(401);
      expect(response.json().error.code).toBe('authentication_required');
    }
  });

  it('exposes CORS allow-origin only for adminOrigin', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/admin/auth/session',
      headers: {
        origin: adminOrigin,
        'access-control-request-method': 'GET',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(adminOrigin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/admin/auth/session',
      headers: {
        origin: 'http://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
