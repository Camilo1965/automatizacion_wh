import { randomBytes } from 'node:crypto';
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
import { IntegrationSecretCrypto } from '../src/modules/integrations/integration-secret-crypto.js';
import { IntegrationSettingsService } from '../src/modules/integrations/integration-settings-service.js';
import { PostgresIntegrationSettingsRepository } from '../src/modules/integrations/postgres-integration-settings-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
describe('safe integration activation', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  const repository = new PostgresIntegrationSettingsRepository(database);
  const service = new IntegrationSettingsService(
    repository,
    new IntegrationSecretCrypto(randomBytes(32).toString('base64')),
  );
  beforeAll(() => runMigrations(url));
  beforeEach(() =>
    database.orm.execute(
      'TRUNCATE integration_settings, integration_drafts, integration_versions',
    ),
  );
  afterAll(async () => {
    vi.unstubAllGlobals();
    await database.orm.execute(
      'TRUNCATE integration_settings, integration_drafts, integration_versions',
    );
    await database.close();
  });
  it('tests login only, activates exact revision, and invalidates tests after edits', async () => {
    await service.update(
      {
        shipping: {
          accountEmail: 'demo@example.com',
          password: 'test-only-secret',
          branchCode: '123',
          pdfType: 1,
        },
      },
      'owner',
    );
    expect(await service.getShipping()).toBeNull();
    await expect(service.activate('shipping', 1, 'owner')).rejects.toThrow();
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'test-provider-token' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', request);
    await service.test('shipping');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe(
      'https://integration.99envios.app/api/integration/v1/login',
    );
    await service.activate('shipping', 1, 'owner');
    await service.activate('shipping', 1, 'owner');
    expect((await repository.lifecycle()).versions).toHaveLength(1);
    const publicRows = await database.orm.execute(
      'SELECT public_configuration FROM integration_versions',
    );
    expect(JSON.stringify(publicRows)).not.toContain('test-only-secret');
    expect(JSON.stringify(publicRows)).not.toContain('password');
    expect((await service.getShipping())?.pdfType).toBe(1);
    await service.update({
      shipping: { password: 'new-test-secret', pdfType: 2 },
    });
    expect((await service.getPublic()).shipping.pdfType).toBe(2);
    expect((await service.getShipping())?.pdfType).toBe(1);
    await expect(service.activate('shipping', 2, 'owner')).rejects.toThrow();
    expect((await service.getShipping())?.password).toBe('test-only-secret');
    expect(JSON.stringify(await service.lifecycle())).not.toContain(
      'test-only-secret',
    );
    expect(JSON.stringify(await service.getPublic())).not.toContain(
      'test-provider-token',
    );
    const [draft] = await database.orm.execute(
      'SELECT encrypted_payload FROM integration_drafts',
    );
    expect(JSON.stringify(draft)).not.toContain('new-test-secret');
    vi.unstubAllGlobals();
  });
});
