import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import {
  ErrorReporter,
  scrubPii,
  sanitizeErrorReport,
} from '../src/modules/observability/error-reporter.js';
import {
  applyBackupSnapshot,
  applyQueueSnapshots,
  classifyRoute,
  MetricsRegistry,
  normalizeCorrelationId,
} from '../src/modules/observability/metrics.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
  storageDriver: 'local',
  metricsEnabled: true,
  workerMetricsPort: 9091,
};

function createDatabaseMock(
  overrides: Partial<PostgresDatabase> = {},
): PostgresDatabase {
  return {
    ping: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    orm: {
      execute: vi.fn(async () => [
        { depth: 0, oldest_age_seconds: 0 },
      ]),
    } as unknown as PostgresDatabase['orm'],
    ...overrides,
  };
}

function createAuthServiceMock(): AuthService {
  return {
    createUser: vi.fn(),
    resetPassword: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  } as unknown as AuthService;
}

function createCatalogServiceMock(): CatalogService {
  return {
    createReference: vi.fn(),
    getAdminReference: vi.fn(),
    listAdminReferences: vi.fn(),
    updateReference: vi.fn(),
    activateReference: vi.fn(),
    setPhysicalStock: vi.fn(),
    listAdminMovements: vi.fn(),
    replacePhoto: vi.fn(),
    deactivateReference: vi.fn(),
    listAvailableForConfirmedSize: vi.fn(),
  } as unknown as CatalogService;
}

function createPhotoStorageMock(): PhotoStorage {
  return {
    save: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
  };
}

describe('metrics registry', () => {
  it('renders bounded HTTP, job, guide, backup and synthetic series without PII labels', () => {
    const metrics = new MetricsRegistry({
      histogramBuckets: [0.05, 0.5],
    });

    metrics.recordHttpRequest({
      method: 'GET',
      routeGroup: 'health',
      statusCode: 200,
      durationSeconds: 0.01,
    });
    metrics.recordHttpRequest({
      method: 'POST',
      routeGroup: 'admin_orders',
      statusCode: 500,
      durationSeconds: 0.2,
    });
    metrics.setDbReady(true);
    metrics.setWorkerHeartbeat(1_700_000_000);
    metrics.setWorkerHeartbeatAgeSeconds(12);
    applyQueueSnapshots(metrics, [
      { queue: 'whatsapp_outbound', depth: 3, oldestAgeSeconds: 40 },
      { queue: 'shipping_guide', depth: 1, oldestAgeSeconds: 120 },
    ]);
    metrics.recordJob({ queue: 'whatsapp_outbound', outcome: 'attempt' });
    metrics.recordJob({ queue: 'shipping_guide', outcome: 'failure' });
    metrics.recordWhatsAppSend('sent');
    metrics.recordWhatsAppSend('failed');
    metrics.recordGuideOutcome('uncertain');
    metrics.recordInventoryConflict('insufficient_stock');
    metrics.recordProviderFailure('shipping');
    applyBackupSnapshot(metrics, {
      lastSuccessfulBackupAt: '2026-09-21T12:00:00.000Z',
      lastBackupAgeSeconds: 3600,
      lastRestoreDrillOk: true,
      lastBackupOk: true,
    });
    metrics.recordSchedulerSuccess(true);
    metrics.recordSyntheticFailure('provider');

    const body = metrics.renderPrometheus();

    expect(body).toContain('kairo_http_requests_total{');
    expect(body).toContain('route_group="health"');
    expect(body).toContain('kairo_http_errors_total{');
    expect(body).toContain('kairo_db_ready 1');
    expect(body).toContain('kairo_worker_heartbeat_unixtime');
    expect(body).toContain('kairo_queue_depth{queue="whatsapp_outbound"} 3');
    expect(body).toContain(
      'kairo_guide_outcomes_total{outcome="uncertain"} 1',
    );
    expect(body).toContain(
      'kairo_inventory_conflicts_total{reason="insufficient_stock"} 1',
    );
    expect(body).toContain('kairo_last_backup_age_seconds 3600');
    expect(body).toContain(
      'kairo_synthetic_failures_total{kind="provider"} 1',
    );
    expect(body).not.toMatch(/3001234567|@|Bearer |password=/i);
  });

  it('classifies routes into bounded groups', () => {
    expect(classifyRoute('/health/ready')).toBe('health');
    expect(classifyRoute('/api/admin/orders/1')).toBe('admin_orders');
    expect(classifyRoute('/webhooks/whatsapp')).toBe('whatsapp');
    expect(classifyRoute('/unknown')).toBe('other');
  });

  it('accepts only safe correlation IDs', () => {
    expect(normalizeCorrelationId('corr-12345678')).toBe('corr-12345678');
    expect(normalizeCorrelationId('bad id')).toBeUndefined();
    expect(normalizeCorrelationId('short')).toBeUndefined();
  });
});

describe('error reporter scrubbing', () => {
  it('redacts phones, emails, tokens and includes release + correlation', () => {
    const scrubbed = scrubPii(
      'call 3001234567 or user@example.com Bearer abcdef.token password=supersecret',
    );
    expect(scrubbed).not.toContain('3001234567');
    expect(scrubbed).not.toContain('user@example.com');
    expect(scrubbed).toContain('[REDACTED]');

    const report = sanitizeErrorReport(
      new Error('fail for 3001234567 user@example.com'),
      {
        correlationId: 'corr-abcdef12',
        releaseSha: 'abc123def',
        environment: 'test',
        tags: { surface: 'http' },
      },
    );
    expect(report.correlationId).toBe('corr-abcdef12');
    expect(report.release).toBe('abc123def');
    expect(report.message).not.toContain('3001234567');
    expect(report.message).not.toContain('user@example.com');
  });

  it('posts sanitized payload to DSN when configured', async () => {
    let postedBody = '';
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = String(init?.body ?? '');
      return new Response('ok', { status: 200 });
    });
    const reporter = new ErrorReporter({
      dsn: 'https://errors.example.com/ingest',
      releaseSha: 'deadbeef',
      environment: 'test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const report = await reporter.report(new Error('boom 3001234567'), {
      correlationId: 'corr-xyzzy123',
      tags: { surface: 'worker' },
    });

    expect(report?.release).toBe('deadbeef');
    expect(report?.message).not.toContain('3001234567');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(postedBody).not.toContain('3001234567');
    expect(postedBody).toContain('deadbeef');
  });

  it('does not embed DSN secrets in reports when disabled', async () => {
    const reporter = new ErrorReporter({});
    expect(reporter.enabled).toBe(false);
    expect(await reporter.report(new Error('noop'))).toBeNull();
  });
});

describe('/metrics HTTP surface', () => {
  it('exposes prometheus text and echoes correlation id', async () => {
    const metrics = new MetricsRegistry();
    metrics.recordSyntheticFailure('api');

    const app = await buildApp({
      config,
      database: createDatabaseMock(),
      metrics,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-correlation-id': 'corr-test-001' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('corr-test-001');
    expect(response.body).toContain('kairo_synthetic_failures_total');
    expect(response.body).toContain('kairo_db_ready');
    await app.close();
  });

  it('requires bearer token when METRICS_TOKEN configured', async () => {
    const app = await buildApp({
      config: { ...config, metricsToken: 'metrics-secret-token' },
      database: createDatabaseMock(),
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    const denied = await app.inject({ method: 'GET', url: '/metrics' });
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer metrics-secret-token' },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });
});

describe('alert rule files', () => {
  it('defines required alert names for staging drills', () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../..',
    );
    const alerts = readFileSync(
      path.join(root, 'infra/prometheus/alerts.yml'),
      'utf8',
    );
    for (const name of [
      'KairoApiDown',
      'KairoWorkerDown',
      'KairoQueueOldestAge',
      'KairoProviderFailuresRepeated',
      'KairoGuideUncertain',
      'KairoBackupTooOld',
      'KairoDiskPressure',
      'KairoCertificateExpiring',
      'KairoSyntheticFailure',
    ]) {
      expect(alerts).toContain(`alert: ${name}`);
    }

    const alertmanager = readFileSync(
      path.join(root, 'infra/alertmanager/alertmanager.yml.example'),
      'utf8',
    );
    expect(alertmanager).toContain('[HUMANO]');
    expect(alertmanager).not.toMatch(/hooks\.slack\.com\/services\/T/);
  });
});
