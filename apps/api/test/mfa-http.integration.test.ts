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
import {
  InMemoryAuthAuditSink,
  type AuthAuditEvent,
} from '../src/modules/auth/auth-audit-sink.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { IntegrationSecretCrypto } from '../src/modules/integrations/integration-secret-crypto.js';
import { currentTotpCode } from './helpers/totp-code.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';
const encryptionKey = randomBytes(32).toString('base64');

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('MFA HTTP enrollment and login', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let auditSink: InMemoryAuthAuditSink;
  let app: FastifyInstance;
  let clock: Date;

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
    expect(response.json()).toMatchObject({
      data: { user: { username } },
    });
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
      sessionIdleTtlMinutes: 60,
      sessionLastSeenThrottleSeconds: 300,
    };

    auditSink = new InMemoryAuthAuditSink();
    authService = new AuthService(new PostgresAdminAuthRepository(database), {
      now: () => clock,
      mfaCrypto: new IntegrationSecretCrypto(encryptionKey),
      mfaSigningKeyBase64: encryptionKey,
      auditSink,
      sessionIdleTtlMs: 60 * 60 * 1000,
      sessionLastSeenThrottleMs: 300 * 1000,
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
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-mfa-http-'));
    clock = new Date('2026-09-22T12:00:00.000Z');
    await buildTestApp();
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    clock = new Date('2026-09-22T12:00:00.000Z');
    await resetTables();
    await buildTestApp();
    await authService.createUser('camila', 'password1234', 'password1234');
  });

  it('enrolls MFA with otpauth URI, confirms with TOTP, stores only recovery hashes', async () => {
    const cookie = await loginCookie('camila', 'password1234');

    const setup = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/setup',
      headers: { origin: adminOrigin, cookie },
    });
    expect(setup.statusCode).toBe(200);
    const setupBody = setup.json() as {
      data: { secret: string; otpauthUri: string };
    };
    expect(setupBody.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(setupBody.data.secret.length).toBeGreaterThan(10);
    expect(JSON.stringify(setupBody)).not.toMatch(/qr\.|chart\.googleapis/i);

    const code = currentTotpCode(setupBody.data.secret, clock);
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/confirm',
      headers: { origin: adminOrigin, cookie },
      payload: { code },
    });
    expect(confirm.statusCode).toBe(200);
    const confirmBody = confirm.json() as {
      data: { recoveryCodes: string[] };
    };
    expect(confirmBody.data.recoveryCodes).toHaveLength(8);

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const hashes = await sql<{ code_hash: string }[]>`
        SELECT code_hash FROM admin_mfa_recovery_codes
      `;
      expect(hashes).toHaveLength(8);
      for (const codeValue of confirmBody.data.recoveryCodes) {
        expect(
          hashes.some((row) => row.code_hash === hashRecoveryCode(codeValue)),
        ).toBe(true);
        expect(hashes.every((row) => row.code_hash !== codeValue)).toBe(true);
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('rejects MFA confirm with invalid TOTP before enabling', async () => {
    const cookie = await loginCookie('camila', 'password1234');
    await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/setup',
      headers: { origin: adminOrigin, cookie },
    });
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/confirm',
      headers: { origin: adminOrigin, cookie },
      payload: { code: '000000' },
    });
    expect(confirm.statusCode).toBe(401);
    expect(confirm.json()).toMatchObject({
      error: { code: 'invalid_mfa_code' },
    });

    const status = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/mfa/enroll',
      headers: { origin: adminOrigin, cookie },
    });
    expect(status.json()).toMatchObject({
      data: { enabled: false, pendingSetup: true },
    });
  });

  it('logs in with TOTP or one-time recovery code and rate-limits MFA verify', async () => {
    const cookie = await loginCookie('camila', 'password1234');
    const setup = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/setup',
      headers: { origin: adminOrigin, cookie },
    });
    const secret = (setup.json() as { data: { secret: string } }).data.secret;
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/confirm',
      headers: { origin: adminOrigin, cookie },
      payload: { code: currentTotpCode(secret, clock) },
    });
    const recoveryCodes = (
      confirm.json() as { data: { recoveryCodes: string[] } }
    ).data.recoveryCodes;

    await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { origin: adminOrigin, cookie },
    });

    const mfaLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    expect(mfaLogin.statusCode).toBe(200);
    const mfaToken = (
      mfaLogin.json() as { data: { mfaToken: string; mfaRequired: true } }
    ).data.mfaToken;
    expect(mfaLogin.headers['set-cookie']).toBeUndefined();

    const badAttempts: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/admin/auth/mfa/verify',
        headers: {
          origin: adminOrigin,
          'x-camila-test-client': 'mfa-bruteforce-client',
        },
        payload: { mfaToken, code: '000000' },
      });
      badAttempts.push(bad.statusCode);
    }
    expect(badAttempts.every((status) => status === 401)).toBe(true);

    const limited = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/verify',
      headers: {
        origin: adminOrigin,
        'x-camila-test-client': 'mfa-bruteforce-client',
      },
      payload: { mfaToken, code: currentTotpCode(secret, clock) },
    });
    expect(limited.statusCode).toBe(429);

    const mfaEvents = auditSink
      .events()
      .filter((event: AuthAuditEvent) => event.action.startsWith('mfa.'));
    expect(
      mfaEvents.some((event) => event.action === 'mfa.verify_failed'),
    ).toBe(true);

    const freshLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    const freshToken = (freshLogin.json() as { data: { mfaToken: string } })
      .data.mfaToken;

    const totpOk = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/verify',
      headers: {
        origin: adminOrigin,
        'x-camila-test-client': 'mfa-success-client',
      },
      payload: {
        mfaToken: freshToken,
        code: currentTotpCode(secret, clock),
      },
    });
    expect(totpOk.statusCode).toBe(200);
    expect(String(totpOk.headers['set-cookie'] ?? '')).toContain(
      `${ADMIN_SESSION_COOKIE}=`,
    );
    expect(
      auditSink
        .events()
        .some((event) => event.action === 'mfa.verify_succeeded'),
    ).toBe(true);

    await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: {
        origin: adminOrigin,
        cookie: cookieFromResponse(totpOk.headers['set-cookie']),
      },
    });

    const recoveryLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    const recoveryToken = (
      recoveryLogin.json() as { data: { mfaToken: string } }
    ).data.mfaToken;
    const recoveryCode = recoveryCodes[0]!;
    const recoveryOk = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/verify',
      headers: {
        origin: adminOrigin,
        'x-camila-test-client': 'mfa-recovery-client',
      },
      payload: { mfaToken: recoveryToken, code: recoveryCode },
    });
    expect(recoveryOk.statusCode).toBe(200);

    const reuseLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    const reuseToken = (reuseLogin.json() as { data: { mfaToken: string } })
      .data.mfaToken;
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/verify',
      headers: {
        origin: adminOrigin,
        'x-camila-test-client': 'mfa-reuse-client',
      },
      payload: { mfaToken: reuseToken, code: recoveryCode },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('disabling MFA requires password and revokes every other session', async () => {
    const cookieA = await loginCookie('camila', 'password1234');
    const setup = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/setup',
      headers: { origin: adminOrigin, cookie: cookieA },
    });
    const secret = (setup.json() as { data: { secret: string } }).data.secret;
    await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/confirm',
      headers: { origin: adminOrigin, cookie: cookieA },
      payload: { code: currentTotpCode(secret, clock) },
    });

    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    const mfaToken = (secondLogin.json() as { data: { mfaToken: string } }).data
      .mfaToken;
    const secondSession = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/verify',
      headers: {
        origin: adminOrigin,
        'x-camila-test-client': 'mfa-disable-second',
      },
      payload: { mfaToken, code: currentTotpCode(secret, clock) },
    });
    const cookieBReal = cookieFromResponse(secondSession.headers['set-cookie']);

    const badDisable = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/disable',
      headers: { origin: adminOrigin, cookie: cookieA },
      payload: { password: 'wrong-password' },
    });
    expect(badDisable.statusCode).toBe(401);

    const disable = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/mfa/disable',
      headers: { origin: adminOrigin, cookie: cookieA },
      payload: { password: 'password1234' },
    });
    expect(disable.statusCode).toBe(204);

    const stillA = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie: cookieA },
    });
    expect(stillA.statusCode).toBe(200);

    const deadB = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { origin: adminOrigin, cookie: cookieBReal },
    });
    expect(deadB.statusCode).toBe(401);
  });
});
