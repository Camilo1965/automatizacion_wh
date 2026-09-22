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
import { AuditService } from '../src/modules/audit/audit-service.js';
import { PostgresAuditRepository } from '../src/modules/audit/postgres-audit-repository.js';
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

describe('admin unified audit', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let auditService: AuditService;
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
          admin_audit_events,
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
      sessionIdleTtlMinutes: 60,
      sessionLastSeenThrottleSeconds: 300,
    };

    auditService = new AuditService(new PostgresAuditRepository(database));
    authService = new AuthService(new PostgresAdminAuthRepository(database), {
      auditSink: auditService.asAuthAuditSink(),
    });

    app = await buildApp({
      config,
      database: wrapDatabase(database),
      authService,
      auditService,
      catalogService: new DefaultCatalogService(
        new PostgresCatalogRepository(database),
        new LocalPhotoStorage(mediaRoot),
      ),
      photoStorage: new LocalPhotoStorage(mediaRoot),
    });
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = createPostgresDatabase(testDatabaseUrl);
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'kairo-audit-'));
    await buildTestApp();
  });

  beforeEach(async () => {
    await resetTables();
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
    await buildTestApp();
    ownerCookie = await login('owner', 'password1234');
    operatorCookie = await login('operator', 'password1234');
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    if (app !== undefined) {
      await app.close();
    }
    await rm(mediaRoot, { recursive: true, force: true });
  });

  it('records login success and failure without leaking secrets', async () => {
    const failed = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'owner', password: 'WrongPassword!!' },
    });
    expect(failed.statusCode).toBe(401);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?action=login.failed',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json();
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    const event = body.data.items.find(
      (item: { action: string }) => item.action === 'login.failed',
    );
    expect(event).toBeDefined();
    expect(JSON.stringify(event)).not.toMatch(/WrongPass|password/i);
    expect(event.metadata).not.toHaveProperty('password');

    const success = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?action=login.succeeded',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(success.statusCode).toBe(200);
    expect(success.json().data.total).toBeGreaterThanOrEqual(1);
  });

  it('denies operators audit:read and allows owners with filters', async () => {
    await auditService.record({
      action: 'order.transitioned',
      result: 'success',
      actorUsername: 'owner',
      targetType: 'order',
      targetId: '00000000-0000-4000-8000-000000000099',
      metadata: { transition: 'dispatch', password: 'secret' },
    });
    await auditService.record({
      action: 'retention.simulated',
      result: 'success',
      actorUsername: 'owner',
      metadata: { candidates: 3 },
    });
    await auditService.record({
      action: 'data.exported',
      result: 'success',
      actorUsername: 'owner',
      metadata: { kind: 'treinta_csv' },
    });

    const denied = await app.inject({
      method: 'GET',
      url: '/api/admin/audit',
      headers: { origin: adminOrigin, cookie: operatorCookie },
    });
    expect(denied.statusCode).toBe(403);

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?action=order.transitioned&limit=10&offset=0',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(filtered.statusCode).toBe(200);
    const data = filtered.json().data;
    expect(data.total).toBe(1);
    expect(data.items[0].action).toBe('order.transitioned');
    expect(data.items[0].metadata).toEqual({ transition: 'dispatch' });
    expect(data.items[0].ipHash).toBeNull();

    const legacy = await app.inject({
      method: 'GET',
      url: '/api/admin/configuration/audit?result=success',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().data.total).toBeGreaterThanOrEqual(3);
  });

  it('persists role change and inventory/export style events via service API', async () => {
    const actions = [
      'role.changed',
      'integration.activated',
      'bot_flow.published',
      'locality_catalog.published',
      'shipping_policy.updated',
      'inventory.adjusted',
      'inventory.closure_generated',
      'inventory.closure_acknowledged',
      'mfa.enabled',
      'session.revoked',
      'retention.executed',
    ] as const;

    for (const action of actions) {
      await auditService.record({
        action,
        result: 'success',
        actorUsername: 'owner',
        metadata: { probe: action },
      });
    }

    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?limit=50',
      headers: { origin: adminOrigin, cookie: ownerCookie },
    });
    expect(listed.statusCode).toBe(200);
    const found = new Set(
      listed.json().data.items.map((item: { action: string }) => item.action),
    );
    for (const action of actions) {
      expect(found.has(action)).toBe(true);
    }
  });
});
