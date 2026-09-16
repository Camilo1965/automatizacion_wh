import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { OwnerAlertWorker } from '../src/modules/alerts/owner-alert-worker.js';
import { PostgresAlertRepository } from '../src/modules/alerts/postgres-alert-repository.js';
import { OwnerAlertSchema } from '@camila/contracts';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
describe('owner notification delivery', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  const alerts = new PostgresAlertRepository(database);
  const settings = {
    getWhatsApp: vi.fn(async () => ({
      phoneNumberId: '123',
      accessToken: 'fixture',
      graphApiVersion: 'v26.0',
      ownerAlertPhone: '+573001234567',
      ownerAlertTemplate: 'alerta_operativa',
    })),
  };
  beforeAll(() => runMigrations(url));
  beforeEach(async () => {
    vi.unstubAllGlobals();
    await database.orm.execute('TRUNCATE owner_alert_deliveries, owner_alerts');
    await alerts.open({
      type: 'guide_created',
      severity: 'info',
      title: 'Guía lista',
      detail: 'REF 01 talla 37',
      entityUrl: '/orders',
      entityId: 'fixture',
      retrySafe: false,
      deduplicationKey: 'guide_created:fixture',
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await database.close();
  });
  it('claims once concurrently and sends an approved template', async () => {
    const request = vi.fn(async () =>
      Response.json({ messages: [{ id: 'wamid.alert' }] }),
    );
    vi.stubGlobal('fetch', request);
    const worker = new OwnerAlertWorker(database, settings);
    await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (request.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body).toMatchObject({
      type: 'template',
      template: { name: 'alerta_operativa', language: { code: 'es_CO' } },
    });
    const result = JSON.parse(JSON.stringify(await alerts.list()));
    expect(OwnerAlertSchema.parse(result[0]).notificationStatus).toBe('sent');
    expect(result[0]).not.toHaveProperty('deduplicationKey');
    expect(await worker.runOnce()).toBe(false);
  });
  it('never repeats an ambiguous send', async () => {
    const request = vi.fn(async () => {
      throw new Error('network interrupted');
    });
    vi.stubGlobal('fetch', request);
    const worker = new OwnerAlertWorker(database, settings);
    await worker.runOnce();
    expect((await alerts.list())[0]?.notificationStatus).toBe('uncertain');
    expect(await worker.runOnce()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
