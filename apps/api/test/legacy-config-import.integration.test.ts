import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { importLegacyConfiguration } from '../src/cli/import-legacy-config.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
describe('legacy configuration import', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  beforeAll(async () => {
    await runMigrations(url);
    await database.orm.execute(
      'TRUNCATE integration_settings, integration_drafts, integration_versions',
    );
  });
  afterAll(async () => {
    await database.orm.execute(
      'TRUNCATE integration_settings, integration_drafts, integration_versions',
    );
    await database.close();
  });
  it('is idempotent and never activates unverified credentials', async () => {
    const environment = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3000',
      ADMIN_ORIGIN: 'http://127.0.0.1:5173',
      DATABASE_URL: url,
      KAIRO_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
      NINETYNINE_ENVIOS_EMAIL: 'legacy@example.com',
      NINETYNINE_ENVIOS_PASSWORD: 'test-legacy-password',
    };
    expect(await importLegacyConfiguration(environment)).toEqual({
      imported: 1,
      activeConnectionsChanged: false,
    });
    expect(await importLegacyConfiguration(environment)).toEqual({
      imported: 0,
      activeConnectionsChanged: false,
    });
    expect(
      await database.orm.execute('SELECT provider FROM integration_settings'),
    ).toHaveLength(0);
    expect(
      JSON.stringify(
        await database.orm.execute(
          'SELECT encrypted_payload FROM integration_drafts',
        ),
      ),
    ).not.toContain('test-legacy-password');
  });
});
