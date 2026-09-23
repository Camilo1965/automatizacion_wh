import { randomUUID } from 'node:crypto';
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
import { PostgresRetentionDataStore } from '../src/modules/privacy/postgres-retention-data-store.js';
import { PostgresRetentionRepository } from '../src/modules/privacy/postgres-retention-repository.js';
import {
  PRIVACY_INVENTORY,
  RetentionService,
} from '../src/modules/privacy/retention-service.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

function approvedClasses() {
  return PRIVACY_INVENTORY.map((item) => ({
    dataClass: item.dataClass,
    action:
      item.dataClass === 'admin_audit_events'
        ? ('retain' as const)
        : item.dataClass === 'sales_orders_customer_pii' ||
            item.dataClass === 'whatsapp_conversations'
          ? ('anonymize' as const)
          : item.allowedActions.includes('delete')
            ? ('delete' as const)
            : ('anonymize' as const),
    retentionDays: 0,
    legalBasis: 'staging-test',
    legalStatus: 'approved' as const,
  }));
}

describe('retention privacy integration', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let auditService: AuditService;
  let retentionService: RetentionService;
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
          retention_runs,
          retention_policies,
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

  async function buildTestApp(executionEnabled: boolean): Promise<void> {
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
      retentionExecutionEnabled: executionEnabled,
    };

    auditService = new AuditService(new PostgresAuditRepository(database));
    authService = new AuthService(new PostgresAdminAuthRepository(database), {
      auditSink: auditService.asAuthAuditSink(),
    });
    retentionService = new RetentionService(
      new PostgresRetentionRepository(database),
      new PostgresRetentionDataStore(database),
      auditService,
      {
        executionEnabled,
        now: () => new Date(),
        confirmPassword: async (actor, password) => {
          if (actor.id === null) {
            return;
          }
          await authService.confirmCurrentPassword(
            { id: actor.id, username: actor.username, role: actor.role },
            password,
          );
        },
      },
    );

    app = await buildApp({
      config,
      database: wrapDatabase(database),
      authService,
      auditService,
      retentionService,
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
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'kairo-privacy-'));
    await buildTestApp(false);
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
    await buildTestApp(false);
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

  it('owner inventory and dry-run have no side effects; operator denied', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: '/api/admin/privacy/inventory',
      headers: { cookie: operatorCookie, origin: adminOrigin },
    });
    expect(denied.statusCode).toBe(403);

    const inventory = await app.inject({
      method: 'GET',
      url: '/api/admin/privacy/inventory',
      headers: { cookie: ownerCookie, origin: adminOrigin },
    });
    expect(inventory.statusCode).toBe(200);
    const inventoryBody = inventory.json();
    expect(inventoryBody.data.legalDurationsStatus).toBe('[HUMANO]');
    expect(inventoryBody.data.items.length).toBeGreaterThan(0);

    const draft = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policies',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        classes: approvedClasses().map((c) => ({
          ...c,
          retentionDays: null,
          legalStatus: 'pending_human_approval',
          legalBasis: '[HUMANO]',
        })),
        currentPassword: 'password1234',
      },
    });
    expect(draft.statusCode).toBe(200);
    const policyId = draft.json().data.policy.id as string;

    const dryRun = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/runs',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        mode: 'dry_run',
        currentPassword: 'password1234',
        policyId,
      },
    });
    expect(dryRun.statusCode).toBe(200);
    const run = dryRun.json().data.run;
    expect(run.status).toBe('completed');
    expect(run.mode).toBe('dry_run');
    const serialized = JSON.stringify(run);
    expect(serialized).not.toMatch(/57300|Calle|Ana |SECRET/i);
  });

  it('execution refuses without approved active policy and when flag off', async () => {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policies',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        classes: approvedClasses(),
        currentPassword: 'password1234',
      },
    });
    expect(draft.statusCode).toBe(200);
    const policyId = draft.json().data.policy.id as string;

    const executeWithoutActive = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/runs',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
        policyId,
      },
    });
    expect(executeWithoutActive.statusCode).toBe(409);

    const activate = await app.inject({
      method: 'POST',
      url: `/api/admin/privacy/policies/${policyId}/activate`,
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        currentPassword: 'password1234',
        confirmIrreversible: true,
      },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().data.policy.status).toBe('active');

    const executeFlagOff = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/runs',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
      },
    });
    expect(executeFlagOff.statusCode).toBe(403);
    expect(executeFlagOff.json().error.code).toBe(
      'retention_execution_disabled',
    );
  });

  it('approved policy with execution enabled completes signed report and preserves audit', async () => {
    await buildTestApp(true);
    ownerCookie = await login('owner', 'password1234');

    const draft = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policies',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        classes: approvedClasses(),
        currentPassword: 'password1234',
      },
    });
    const policyId = draft.json().data.policy.id as string;
    await app.inject({
      method: 'POST',
      url: `/api/admin/privacy/policies/${policyId}/activate`,
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        currentPassword: 'password1234',
        confirmIrreversible: true,
      },
    });

    const execute = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/runs',
      headers: { cookie: ownerCookie, origin: adminOrigin },
      payload: {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
      },
    });
    expect(execute.statusCode).toBe(200);
    const run = execute.json().data.run;
    expect(run.status).toBe('completed');
    expect(run.report?.signature).toMatch(/^[a-f0-9]{64}$/);

    const audit = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?action=retention.executed',
      headers: { cookie: ownerCookie, origin: adminOrigin },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().data.total).toBeGreaterThan(0);
  });

  it('removes nested customer PII from persisted order summaries when anonymizing', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    const referenceId = randomUUID();
    const orderId = randomUUID();
    const referenceCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const customerPhone = `57300${randomUUID().replaceAll('-', '').slice(0, 7)}`;
    const snapshot = {
      schemaVersion: 1,
      customer: { name: 'Ana Gómez', phone: customerPhone },
      destination: {
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        locality: 'Bogotá',
        deliveryNotes: 'Portería azul',
      },
    };
    const legacySnapshot = {
      schemaVersion: 0,
      customerName: 'Ana Gómez',
      customerPhone,
      address: 'Calle 1 # 2-3',
      deliveryNotes: 'Portería azul',
    };

    try {
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${referenceCode}, 'Prueba', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (
          id, reference_id, size, quantity, customer_name, customer_phone,
          address, locality_carrier_code, locality_name, delivery_notes
        ) VALUES (
          ${orderId}, ${referenceId}, 37, 1, 'Ana Gómez', ${customerPhone},
          'Calle 1 # 2-3', '11001', 'Bogotá', 'Portería azul'
        )
      `;
      await sql`
        INSERT INTO order_summaries (order_id, version, draft_version, snapshot)
        VALUES
          (${orderId}, 1, 1, ${sql.json(snapshot)}),
          (${orderId}, 2, 1, ${sql.json(legacySnapshot)})
      `;

      await new PostgresRetentionDataStore(database).anonymizeCustomer(
        customerPhone,
      );

      const summaries = await sql<
        { version: number; snapshot: Record<string, unknown> }[]
      >`
        SELECT version, snapshot FROM order_summaries
        WHERE order_id = ${orderId} ORDER BY version
      `;
      const nested = summaries.find((item) => item.version === 1)?.snapshot;
      expect(nested).toMatchObject({
        customer: { name: 'ANONIMIZADO', phone: '0000000000' },
        destination: {
          address: null,
          localityCarrierCode: '11001',
          locality: 'Bogotá',
          deliveryNotes: null,
        },
      });
      const legacy = summaries.find((item) => item.version === 2)?.snapshot;
      expect(legacy).toMatchObject({
        customerName: 'ANONIMIZADO',
        customerPhone: '0000000000',
      });
      expect(legacy).not.toHaveProperty('address');
      expect(legacy).not.toHaveProperty('deliveryNotes');
      expect(JSON.stringify(summaries)).not.toMatch(
        /Ana Gómez|57300|Calle 1|Portería azul/,
      );
    } finally {
      await sql`DELETE FROM order_summaries WHERE order_id = ${orderId}`;
      await sql`DELETE FROM sales_orders WHERE id = ${orderId}`;
      await sql`DELETE FROM catalog_references WHERE id = ${referenceId}`;
      await sql.end({ timeout: 5 });
    }
  });
});
