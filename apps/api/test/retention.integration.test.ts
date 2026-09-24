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
import { resolveCustomerContact } from '../src/modules/customers/customer-contact.js';
import { PostgresWhatsAppInboundRepository } from '../src/modules/whatsapp/postgres-whatsapp-inbound-repository.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { PostgresRetentionDataStore } from '../src/modules/privacy/postgres-retention-data-store.js';
import { PostgresRetentionRepository } from '../src/modules/privacy/postgres-retention-repository.js';
import { LocalGuidePdfStorage } from '../src/modules/shipping/local-guide-pdf-storage.js';
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
  let guidePdfStorage: LocalGuidePdfStorage;
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
      new PostgresRetentionDataStore(database, guidePdfStorage),
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
    guidePdfStorage = new LocalGuidePdfStorage(path.join(mediaRoot, 'guides'));
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

  it('removes nested order PII and guide PDFs during retention anonymization', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    const referenceId = randomUUID();
    const orderId = randomUUID();
    const guideJobId = randomUUID();
    const referenceCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const customerPhone = `+573${Date.now().toString().slice(-9)}`;
    const preShipmentNumber = `pre-${guideJobId}`;
    const pdf = await guidePdfStorage.save(
      new TextEncoder().encode('%PDF-retention-test'),
    );
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
        INSERT INTO shipping_guide_jobs (
          id, order_id, status, carrier, pre_shipment_number,
          guide_pdf_storage_key, guide_pdf_sha256, guide_pdf_byte_size,
          guide_pdf_fetched_at
        ) VALUES (
          ${guideJobId}, ${orderId}, 'created', 'envia', ${preShipmentNumber},
          ${pdf.storageKey}, ${pdf.sha256}, ${pdf.byteSize}, now()
        )
      `;
      await sql`
        INSERT INTO order_summaries (order_id, version, draft_version, snapshot)
        VALUES
          (${orderId}, 1, 1, ${sql.json(snapshot)}),
          (${orderId}, 2, 1, ${sql.json(legacySnapshot)})
      `;

      const store = new PostgresRetentionDataStore(database, guidePdfStorage);
      await store.applyAction('sales_orders_customer_pii', 'anonymize', [
        orderId,
      ]);

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
      const [guide] = await sql`
        SELECT guide_pdf_storage_key, guide_pdf_retired_at
        FROM shipping_guide_jobs WHERE id = ${guideJobId}
      `;
      expect(legacy).toMatchObject({
        customerName: 'ANONIMIZADO',
        customerPhone: '0000000000',
      });
      expect(guide).toMatchObject({ guide_pdf_storage_key: null });
      expect(guide?.guide_pdf_retired_at).not.toBeNull();
      await expect(guidePdfStorage.read(pdf.storageKey)).rejects.toThrow();
      expect(legacy).not.toHaveProperty('address');
      expect(legacy).not.toHaveProperty('deliveryNotes');
      expect(JSON.stringify(summaries)).not.toMatch(
        /Ana Gómez|57300|Calle 1|Portería azul/,
      );
    } finally {
      await sql`DELETE FROM shipping_guide_jobs WHERE id = ${guideJobId}`;
      await sql`DELETE FROM order_summaries WHERE order_id = ${orderId}`;
      await sql`DELETE FROM sales_orders WHERE id = ${orderId}`;
      await sql`DELETE FROM catalog_references WHERE id = ${referenceId}`;
      await sql.end({ timeout: 5 });
    }
  });

  it('anonymizes a linked customer profile without deleting its operational identity', async () => {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    const customerId = randomUUID();
    const referenceId = randomUUID();
    const orderId = randomUUID();
    const guideJobId = randomUUID();
    const conversationId = randomUUID();
    const customerPhone = `+573${Date.now().toString().slice(-9)}`;
    const changedPhone = `${customerPhone.slice(0, -1)}${(Number(customerPhone.slice(-1)) + 1) % 10}`;
    const referenceCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const preShipmentNumber = `pre-${guideJobId}`;
    const pdf = await guidePdfStorage.save(
      new TextEncoder().encode('%PDF-privacy-test'),
    );

    try {
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${referenceCode}, 'Prueba', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO customers (
          id, display_name, normalized_phone, marketing_consent,
          marketing_consent_channel, marketing_consent_purpose,
          marketing_consent_notice_version, marketing_consent_evidence_ref,
          marketing_consent_recorded_at
        ) VALUES (
          ${customerId}, 'Ana Gómez', ${customerPhone}, 'granted', 'whatsapp',
          'marketing', 'notice-v1', ${`evidence-${customerId}`}, now()
        )
      `;
      await sql`
        INSERT INTO sales_orders (
          id, reference_id, size, quantity, customer_name, customer_phone,
          customer_id, address
        ) VALUES (
          ${orderId}, ${referenceId}, 37, 1, 'Ana Gómez', ${changedPhone},
          ${customerId}, 'Calle 1 # 2-3'
        )
      `;
      await sql`
        INSERT INTO shipping_guide_jobs (
          id, order_id, status, carrier, pre_shipment_number,
          guide_pdf_storage_key, guide_pdf_sha256, guide_pdf_byte_size,
          guide_pdf_fetched_at
        ) VALUES (
          ${guideJobId}, ${orderId}, 'created', 'envia', ${preShipmentNumber},
          ${pdf.storageKey}, ${pdf.sha256}, ${pdf.byteSize}, now()
        )
      `;
      await sql`
        INSERT INTO whatsapp_conversations (
          id, customer_phone, customer_id, state, last_inbound_message_at
        ) VALUES (
          ${conversationId}, ${changedPhone}, ${customerId}, 'idle', now()
        )
      `;

      const store = new PostgresRetentionDataStore(database, guidePdfStorage);
      const localPhone = customerPhone.slice(3);
      const preview = await store.findCustomerRelated(localPhone);
      expect(preview.customerIds).toEqual([customerId]);
      expect(preview.orders.map((order) => order.id)).toEqual([orderId]);

      const result = await store.anonymizeCustomer(localPhone);

      const [customer] = await sql`
        SELECT id, display_name, normalized_phone, marketing_consent,
          marketing_consent_channel, marketing_consent_purpose,
          marketing_consent_notice_version, marketing_consent_evidence_ref,
          marketing_consent_recorded_at, needs_review
        FROM customers WHERE id = ${customerId}
      `;
      const [order] = await sql`
        SELECT customer_id, customer_name, customer_phone, address
        FROM sales_orders WHERE id = ${orderId}
      `;
      const [conversation] = await sql`
        SELECT customer_id, customer_phone
        FROM whatsapp_conversations WHERE id = ${conversationId}
      `;
      const [guide] = await sql`
        SELECT guide_pdf_storage_key, guide_pdf_sha256,
          guide_pdf_byte_size, guide_pdf_fetched_at, guide_pdf_retired_at
        FROM shipping_guide_jobs WHERE id = ${guideJobId}
      `;

      expect(result.relatedCounts.customers).toBe(1);
      expect(result.relatedCounts.shippingGuides).toBe(1);
      expect(guide).toMatchObject({
        guide_pdf_storage_key: null,
        guide_pdf_sha256: null,
        guide_pdf_byte_size: null,
        guide_pdf_fetched_at: null,
      });
      expect(guide?.guide_pdf_retired_at).not.toBeNull();
      await expect(guidePdfStorage.read(pdf.storageKey)).rejects.toThrow();
      expect(customer).toMatchObject({
        id: customerId,
        display_name: null,
        normalized_phone: null,
        marketing_consent: 'unknown',
        marketing_consent_channel: null,
        marketing_consent_purpose: null,
        marketing_consent_notice_version: null,
        marketing_consent_evidence_ref: null,
        marketing_consent_recorded_at: null,
        needs_review: true,
      });
      expect(order).toMatchObject({
        customer_id: customerId,
        customer_name: 'ANONIMIZADO',
        customer_phone: '0000000000',
        address: null,
      });
      expect(conversation).toMatchObject({ customer_id: customerId });
      expect(conversation?.customer_phone).not.toBe(changedPhone);
      await expect(
        new PostgresOrderRepository(database).update({
          orderId,
          address: 'Nueva dirección identificable',
        }),
      ).rejects.toThrow('El contacto del pedido cambió');
      await expect(
        new PostgresOrderRepository(database).update({
          orderId,
          customerPhone: null,
        }),
      ).rejects.toThrow('El contacto del pedido cambió');
      await expect(
        new PostgresOutboundRepository(database).enqueueText({
          conversationId,
          customerPhone: changedPhone,
          body: 'Texto posterior',
          idempotencyKey: `after-anonymize-${conversationId}`,
        }),
      ).rejects.toThrow('Conversation identity changed or was anonymized');

      const reopenedCustomerId = await database.orm.transaction((transaction) =>
        resolveCustomerContact(transaction, {
          normalizedPhone: customerPhone,
          displayName: 'Ana Gómez',
        }),
      );
      expect(reopenedCustomerId).not.toBe(customerId);
    } finally {
      await sql`DELETE FROM shipping_guide_jobs WHERE id = ${guideJobId}`;
      await sql`DELETE FROM whatsapp_conversations WHERE id = ${conversationId}`;
      await sql`DELETE FROM sales_orders WHERE id = ${orderId}`;
      await sql`DELETE FROM customers WHERE id = ${customerId} OR normalized_phone = ${customerPhone}`;
      await sql`DELETE FROM catalog_references WHERE id = ${referenceId}`;
      await sql.end({ timeout: 5 });
    }
  });

  it('rolls back every redaction and the profile when a later database write fails', async () => {
    const sql = postgres(testDatabaseUrl, { max: 2, prepare: false });
    const customerId = randomUUID();
    const referenceId = randomUUID();
    const orderId = randomUUID();
    const inboundId = randomUUID();
    const customerPhone = `+573${Date.now().toString().slice(-9)}`;
    const constraintName = `test_anon_failure_${inboundId.replaceAll('-', '')}`;
    try {
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${`TEST-${randomUUID().slice(0, 8).toUpperCase()}`}, 'Prueba', 'Negro', 120000)`;
      await sql`INSERT INTO customers (id, display_name, normalized_phone)
        VALUES (${customerId}, 'Ana Gómez', ${customerPhone})`;
      await sql`INSERT INTO sales_orders (id, reference_id, size, quantity, customer_id, customer_name, customer_phone, address)
        VALUES (${orderId}, ${referenceId}, 37, 1, ${customerId}, 'Ana Gómez', ${customerPhone}, 'Calle 1')`;
      await sql`INSERT INTO whatsapp_inbound_messages
        (id, whatsapp_message_id, business_phone_number_id, customer_phone, message_type, text_body, received_at, payload)
        VALUES (${inboundId}, ${`wamid.${inboundId}`}, 'business-test', ${customerPhone}, 'text', 'Hola Ana', now(), '{}'::jsonb)`;
      await sql.unsafe(
        `ALTER TABLE whatsapp_inbound_messages ADD CONSTRAINT "${constraintName}" CHECK (id <> '${inboundId}' OR customer_phone <> '0000000000')`,
      );

      await expect(
        new PostgresRetentionDataStore(
          database,
          guidePdfStorage,
        ).anonymizeCustomer(customerPhone),
      ).rejects.toThrow();
      const [customer] =
        await sql`SELECT display_name, normalized_phone, marketing_consent FROM customers WHERE id = ${customerId}`;
      const [order] =
        await sql`SELECT customer_name, customer_phone, address FROM sales_orders WHERE id = ${orderId}`;
      const [inbound] =
        await sql`SELECT customer_phone, text_body FROM whatsapp_inbound_messages WHERE id = ${inboundId}`;
      expect(customer).toMatchObject({
        display_name: 'Ana Gómez',
        normalized_phone: customerPhone,
        marketing_consent: 'unknown',
      });
      expect(order).toMatchObject({
        customer_name: 'Ana Gómez',
        customer_phone: customerPhone,
        address: 'Calle 1',
      });
      expect(inbound).toMatchObject({
        customer_phone: customerPhone,
        text_body: 'Hola Ana',
      });
    } finally {
      await sql.unsafe(
        `ALTER TABLE whatsapp_inbound_messages DROP CONSTRAINT IF EXISTS "${constraintName}"`,
      );
      await sql`DELETE FROM whatsapp_inbound_messages WHERE id = ${inboundId}`;
      await sql`DELETE FROM sales_orders WHERE id = ${orderId}`;
      await sql`DELETE FROM customers WHERE id = ${customerId}`;
      await sql`DELETE FROM catalog_references WHERE id = ${referenceId}`;
      await sql.end({ timeout: 5 });
    }
  }, 10_000);

  it('waits for same-phone inbound ingress before snapshotting and redacts that row', async () => {
    const sql = postgres(testDatabaseUrl, { max: 3, prepare: false });
    const phone = `+573${Date.now().toString().slice(-9)}`;
    const inboundId = randomUUID();
    let releaseIngress!: () => void;
    let ingressLocked!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseIngress = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ingressLocked = resolve;
    });
    const ingress = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
      await tx`INSERT INTO whatsapp_inbound_messages
        (id, whatsapp_message_id, business_phone_number_id, customer_phone, message_type, text_body, received_at, payload)
        VALUES (${inboundId}, ${`wamid.${inboundId}`}, 'business-test', ${phone}, 'text', 'Mensaje concurrente', now(), '{}'::jsonb)`;
      ingressLocked();
      await release;
    });
    try {
      await locked;
      const anonymizing = new PostgresRetentionDataStore(
        database,
        guidePdfStorage,
      ).anonymizeCustomer(phone);
      await waitForAdvisoryWait(sql);
      releaseIngress();
      const result = await anonymizing;
      await ingress;
      const [inbound] =
        await sql`SELECT customer_phone, text_body FROM whatsapp_inbound_messages WHERE id = ${inboundId}`;
      expect(result.relatedCounts.inbound).toBe(1);
      expect(inbound).toMatchObject({
        customer_phone: '0000000000',
        text_body: null,
      });
    } finally {
      releaseIngress();
      await ingress;
      await sql`DELETE FROM whatsapp_inbound_messages WHERE id = ${inboundId}`;
      await sql.end({ timeout: 5 });
    }
  }, 10_000);

  it('serializes inbox, contact, order edit, and outbound ingress on the same phone', async () => {
    const sql = postgres(testDatabaseUrl, { max: 5, prepare: false });
    const phone = `+573${Date.now().toString().slice(-9)}`;
    const changedPhone = `${phone.slice(0, -1)}${(Number(phone.slice(-1)) + 1) % 10}`;
    const customerId = randomUUID();
    const referenceId = randomUUID();
    const orderId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    try {
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES (${referenceId}, ${`TEST-${randomUUID().slice(0, 8).toUpperCase()}`}, 'Prueba', 'Negro', 120000)`;
      await sql`INSERT INTO customers (id, display_name, normalized_phone)
        VALUES (${customerId}, 'Ana', ${phone})`;
      await sql`INSERT INTO sales_orders
        (id, reference_id, size, quantity, customer_id, customer_name, customer_phone,
         address, locality_carrier_code, locality_department, locality_name)
        VALUES (${orderId}, ${referenceId}, 37, 1, ${customerId}, 'Ana', ${changedPhone},
          'Calle 1', '11001000', 'Bogotá', 'Bogotá')`;
      await sql`INSERT INTO whatsapp_conversations (id, customer_phone, customer_id, state, last_inbound_message_at)
        VALUES (${conversationId}, ${changedPhone}, ${customerId}, 'idle', now())`;

      await expectWriterWaitsOnPhone(sql, phone, () =>
        new PostgresWhatsAppInboundRepository(database).storeMany([
          {
            whatsappMessageId: `wamid.${messageId}`,
            businessPhoneNumberId: 'business-test',
            customerPhone: phone,
            messageType: 'text',
            textBody: 'Nuevo mensaje',
            receivedAt: new Date(),
            payload: {},
          },
        ]),
      );
      const resolvedId = await expectWriterWaitsOnPhone(sql, phone, () =>
        database.orm.transaction((tx) =>
          resolveCustomerContact(tx, {
            normalizedPhone: phone,
            displayName: 'Ana',
          }),
        ),
      );
      expect(resolvedId).toBe(customerId);
      await expectWriterWaitsOnPhone(sql, phone, () =>
        new PostgresOrderRepository(database).update({
          orderId,
          address: 'Calle 2',
        }),
      );
      await expectWriterWaitsOnPhone(sql, phone, () =>
        new PostgresOutboundRepository(database).enqueueText({
          conversationId,
          customerPhone: changedPhone,
          body: 'Respuesta',
          idempotencyKey: `reply-${messageId}`,
        }),
      );
      await expectWriterWaitsOnCustomerId(sql, customerId, () =>
        new PostgresOrderRepository(database).update({
          orderId,
          address: 'Calle 3',
        }),
      );
      const summary = await expectWriterWaitsOnCustomerId(sql, customerId, () =>
        new PostgresOrderRepository(database).createSummary(orderId),
      );
      expect(summary.snapshot).toMatchObject({
        customer: { name: 'Ana', phone: changedPhone },
        destination: { address: 'Calle 3' },
      });
      await expectWriterWaitsOnCustomerId(sql, customerId, () =>
        new PostgresOutboundRepository(database).enqueueText({
          conversationId,
          customerPhone: changedPhone,
          body: 'Otra respuesta',
          idempotencyKey: `reply-id-${messageId}`,
        }),
      );
      const [counts] = await sql`SELECT
        (SELECT count(*)::int FROM whatsapp_inbound_messages WHERE whatsapp_message_id = ${`wamid.${messageId}`}) AS inbound,
        (SELECT count(*)::int FROM whatsapp_outbound_messages WHERE idempotency_key = ${`reply-${messageId}`}) AS outbound`;
      expect(counts).toMatchObject({ inbound: 1, outbound: 1 });
    } finally {
      await sql`DELETE FROM whatsapp_conversation_messages WHERE conversation_id = ${conversationId}`;
      await sql`DELETE FROM whatsapp_outbound_messages WHERE conversation_id = ${conversationId}`;
      await sql`DELETE FROM whatsapp_inbound_messages WHERE whatsapp_message_id = ${`wamid.${messageId}`}`;
      await sql`DELETE FROM whatsapp_conversations WHERE id = ${conversationId}`;
      await sql`DELETE FROM order_summaries WHERE order_id = ${orderId}`;
      await sql`DELETE FROM sales_orders WHERE id = ${orderId}`;
      await sql`DELETE FROM customers WHERE id = ${customerId}`;
      await sql`DELETE FROM catalog_references WHERE id = ${referenceId}`;
      await sql.end({ timeout: 5 });
    }
  }, 20_000);

  it('does not leave a concurrent changed-phone transcript linked to an anonymized customer', async () => {
    const sql = postgres(testDatabaseUrl, { max: 4, prepare: false });
    const profilePhone = `+573${Date.now().toString().slice(-9)}`;
    const incomingPhone = `${profilePhone.slice(0, -1)}${(Number(profilePhone.slice(-1)) + 1) % 10}`;
    const customerId = randomUUID();
    const oldConversationId = randomUUID();
    const inboundMessageId = `race-${randomUUID()}`;
    let releaseRow!: () => void;
    let rowLocked!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseRow = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      rowLocked = resolve;
    });
    let holder: Promise<unknown> | undefined;
    let anonymizing: Promise<unknown> | undefined;
    let receiving:
      ReturnType<PostgresConversationRepository['receive']> | undefined;
    try {
      await sql`INSERT INTO customers (id, display_name, normalized_phone)
        VALUES (${customerId}, 'Ana', ${profilePhone})`;
      await sql`INSERT INTO whatsapp_conversations (id, customer_phone, customer_id, state, last_inbound_message_at)
        VALUES (${oldConversationId}, ${incomingPhone}, ${customerId}, 'awaiting_size', now())`;
      holder = sql.begin(async (tx) => {
        await tx`SELECT id FROM whatsapp_conversations WHERE id = ${oldConversationId} FOR UPDATE`;
        rowLocked();
        await released;
      });
      await locked;
      anonymizing = new PostgresRetentionDataStore(
        database,
        guidePdfStorage,
      ).anonymizeCustomer(profilePhone);
      await waitForBlockedTransactions(sql, 1);
      receiving = new PostgresConversationRepository(database).receive({
        whatsappMessageId: inboundMessageId,
        customerPhone: incomingPhone,
        text: 'Mensaje nuevo identificable',
      });
      await waitForBlockedTransactions(sql, 2);
      releaseRow();
      await holder;
      await anonymizing;
      const result = await receiving;
      const [oldConversation] =
        await sql`SELECT customer_id, customer_phone FROM whatsapp_conversations WHERE id = ${oldConversationId}`;
      const [oldPii] =
        await sql`SELECT count(*)::int AS count FROM whatsapp_conversation_messages
        WHERE conversation_id = ${oldConversationId} AND text_body IS NOT NULL`;
      const [profile] =
        await sql`SELECT normalized_phone FROM customers WHERE id = ${customerId}`;
      expect(profile?.normalized_phone).toBeNull();
      expect(oldConversation?.customer_id).toBe(customerId);
      expect(oldConversation?.customer_phone).not.toBe(incomingPhone);
      expect(oldPii?.count).toBe(0);
      expect(result.conversationId).not.toBe(oldConversationId);
      expect(result.customerId).not.toBe(customerId);
    } finally {
      releaseRow();
      if (holder !== undefined) await holder;
      if (anonymizing !== undefined) await anonymizing.catch(() => undefined);
      if (receiving !== undefined) await receiving.catch(() => undefined);
      await sql`DELETE FROM whatsapp_conversation_messages WHERE conversation_id IN
        (SELECT id FROM whatsapp_conversations WHERE id = ${oldConversationId} OR customer_phone = ${incomingPhone})`;
      await sql`DELETE FROM whatsapp_conversation_events WHERE conversation_id IN
        (SELECT id FROM whatsapp_conversations WHERE id = ${oldConversationId} OR customer_phone = ${incomingPhone})`;
      await sql`DELETE FROM whatsapp_conversations WHERE id = ${oldConversationId} OR customer_phone = ${incomingPhone}`;
      await sql`DELETE FROM customers WHERE id = ${customerId} OR normalized_phone = ${incomingPhone}`;
      await sql.end({ timeout: 5 });
    }
  }, 20_000);
});

async function waitForBlockedTransactions(
  sql: postgres.Sql,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await sql<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND pid <> pg_backend_pid()
    `;
    if ((row?.blocked ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Expected ${count} blocked database transactions`);
}

async function expectWriterWaitsOnPhone<T>(
  sql: postgres.Sql,
  phone: string,
  write: () => Promise<T>,
): Promise<T> {
  let locked!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
    locked();
    await released;
  });
  await held;
  const pending = write();
  try {
    await waitForAdvisoryWait(sql);
  } finally {
    release();
    await holder;
  }
  return pending;
}

async function expectWriterWaitsOnCustomerId<T>(
  sql: postgres.Sql,
  customerId: string,
  write: () => Promise<T>,
): Promise<T> {
  let locked!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`kairo.customer.id:${customerId}`}))`;
    locked();
    await released;
  });
  await held;
  const pending = write();
  try {
    await waitForAdvisoryWait(sql);
  } finally {
    release();
    await holder;
  }
  return pending;
}

async function waitForAdvisoryWait(sql: postgres.Sql): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await sql<{ waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event = 'advisory'
          AND query LIKE '%pg_advisory_xact_lock%'
          AND pid <> pg_backend_pid()
      ) AS waiting
    `;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Expected a same-phone advisory-lock wait');
}
