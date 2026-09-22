import { randomBytes } from 'node:crypto';
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
import { IntegrationSecretCrypto } from '../src/modules/integrations/integration-secret-crypto.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';
const encryptionKey = randomBytes(32).toString('base64');

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

describe('session security', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let app: FastifyInstance;
  let clock: Date;
  let idleMs: number;
  let throttleMs: number;

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

  async function loginCookie(
    username: string,
    password: string,
  ): Promise<string> {
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
      integrationEncryptionKey: encryptionKey,
      sessionIdleTtlMinutes: Math.max(1, Math.round(idleMs / 60_000)),
      sessionLastSeenThrottleSeconds: Math.max(
        1,
        Math.round(throttleMs / 1000),
      ),
    };

    authService = new AuthService(new PostgresAdminAuthRepository(database), {
      now: () => clock,
      mfaCrypto: new IntegrationSecretCrypto(encryptionKey),
      mfaSigningKeyBase64: encryptionKey,
      sessionIdleTtlMs: idleMs,
      sessionLastSeenThrottleMs: throttleMs,
    });

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
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-session-sec-'));
    clock = new Date('2026-09-22T12:00:00.000Z');
    idleMs = 60 * 60 * 1000;
    throttleMs = 5 * 60 * 1000;
    await buildTestApp();
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    clock = new Date('2026-09-22T12:00:00.000Z');
    idleMs = 60 * 60 * 1000;
    throttleMs = 5 * 60 * 1000;
    await resetTables();
    await buildTestApp();
    await authService.createUser('camila', 'password1234', 'password1234');
  });

  it('lists active sessions and revokes individual or all other sessions', async () => {
    const cookieA = await loginCookie('camila', 'password1234');
    clock = new Date(clock.getTime() + 1000);
    const cookieB = await loginCookie('camila', 'password1234');

    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/sessions',
      headers: { origin: adminOrigin, cookie: cookieA },
    });
    expect(listed.statusCode).toBe(200);
    const items = (
      listed.json() as {
        data: {
          items: Array<{
            id: string;
            current: boolean;
            createdAt: string;
            expiresAt: string;
            lastSeenAt: string;
          }>;
        };
      }
    ).data.items;
    expect(items).toHaveLength(2);
    expect(items.filter((item) => item.current)).toHaveLength(1);
    expect(items.every((item) => item.expiresAt > item.createdAt)).toBe(true);

    const otherId = items.find((item) => !item.current)!.id;
    const revokeOne = await app.inject({
      method: 'POST',
      url: `/api/admin/auth/sessions/${otherId}/revoke`,
      headers: { origin: adminOrigin, cookie: cookieA },
    });
    expect(revokeOne.statusCode).toBe(204);

    const deadB = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie: cookieB },
    });
    expect(deadB.statusCode).toBe(401);

    clock = new Date(clock.getTime() + 1000);
    const cookieC = await loginCookie('camila', 'password1234');
    const revokeOthers = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/sessions/revoke-others',
      headers: { origin: adminOrigin, cookie: cookieC },
    });
    expect(revokeOthers.statusCode).toBe(204);

    const deadA = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie: cookieA },
    });
    expect(deadA.statusCode).toBe(401);

    const aliveC = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie: cookieC },
    });
    expect(aliveC.statusCode).toBe(200);
  });

  it('enforces idle expiry and throttles lastSeenAt updates', async () => {
    idleMs = 10 * 60 * 1000;
    throttleMs = 5 * 60 * 1000;
    await buildTestApp();
    await authService.createUser('idle_user', 'password1234', 'password1234');
    const cookie = await loginCookie('idle_user', 'password1234');

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    let firstSeen: Date;
    try {
      const rows = await sql<{ last_seen_at: Date }[]>`
        SELECT last_seen_at FROM admin_sessions WHERE revoked_at IS NULL
      `;
      expect(rows).toHaveLength(1);
      firstSeen = rows[0]!.last_seen_at;
    } finally {
      await sql.end({ timeout: 5 });
    }

    clock = new Date(clock.getTime() + 60 * 1000);
    const touchEarly = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie },
    });
    expect(touchEarly.statusCode).toBe(200);

    const sql2 = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const rows = await sql2<{ last_seen_at: Date }[]>`
        SELECT last_seen_at FROM admin_sessions WHERE revoked_at IS NULL
      `;
      expect(new Date(rows[0]!.last_seen_at).getTime()).toBe(
        new Date(firstSeen).getTime(),
      );
    } finally {
      await sql2.end({ timeout: 5 });
    }

    clock = new Date(clock.getTime() + 5 * 60 * 1000);
    const touchLater = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie },
    });
    expect(touchLater.statusCode).toBe(200);

    const sql3 = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const rows = await sql3<{ last_seen_at: Date }[]>`
        SELECT last_seen_at FROM admin_sessions WHERE revoked_at IS NULL
      `;
      expect(new Date(rows[0]!.last_seen_at).getTime()).toBe(clock.getTime());
    } finally {
      await sql3.end({ timeout: 5 });
    }

    clock = new Date(clock.getTime() + idleMs + 1000);
    const expired = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie },
    });
    expect(expired.statusCode).toBe(401);
  });

  it('password reset revokes open sessions; absolute expiry remains 12h', async () => {
    const cookie = await loginCookie('camila', 'password1234');
    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/sessions',
      headers: { origin: adminOrigin, cookie },
    });
    const expiresAt = new Date(
      (
        listed.json() as {
          data: { items: Array<{ expiresAt: string; createdAt: string }> };
        }
      ).data.items[0]!.expiresAt,
    );
    const createdAt = new Date(
      (
        listed.json() as {
          data: { items: Array<{ expiresAt: string; createdAt: string }> };
        }
      ).data.items[0]!.createdAt,
    );
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(12 * 60 * 60 * 1000);

    await authService.resetPassword('camila', 'password9999', 'password9999');

    const dead = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie },
    });
    expect(dead.statusCode).toBe(401);
  });
});
