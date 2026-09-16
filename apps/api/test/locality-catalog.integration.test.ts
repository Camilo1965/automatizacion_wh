import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { LocalityCatalogService } from '../src/modules/localities/locality-catalog-service.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
describe('locality catalog publishing', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  const service = new LocalityCatalogService(database);
  beforeAll(() => runMigrations(url));
  beforeEach(() =>
    database.orm.execute(
      'TRUNCATE locality_catalog_versions, shipping_localities CASCADE',
    ),
  );
  afterAll(() => database.close());
  const source =
    '["value" => "08001000", "label" => "BARRANQUILLA - ATLANTICO"]';
  it('reuses the preview for the same source and active base under concurrent requests', async () => {
    const [first, second] = await Promise.all([
      service.preview(source, '99envios_document', 'owner'),
      service.preview(source, '99envios_document', 'owner'),
    ]);
    expect(first.id).toBe(second.id);
    expect(await service.list()).toHaveLength(1);
  });
  it('publishes, rejects stale previews and restores in an auditable new version', async () => {
    const first = await service.preview(source, '99envios_document', 'owner');
    const stale = await service.preview(
      source
        .replace('08001000', '05001000')
        .replace('BARRANQUILLA - ATLANTICO', 'MEDELLIN - ANTIOQUIA'),
      '99envios_document',
      'owner',
    );
    expect(first.rows[0]?.locality).toBe('Barranquilla');
    await service.publish(first.id, 'owner');
    await expect(service.publish(stale.id, 'owner')).rejects.toMatchObject({
      code: 'stale_preview',
    });
    const second = await service.preview(
      source
        .replace('08001000', '05001000')
        .replace('BARRANQUILLA - ATLANTICO', 'MEDELLIN - ANTIOQUIA'),
      '99envios_document',
      'owner',
    );
    await service.publish(second.id, 'owner');
    const versions = await service.publish(first.id, 'owner', true);
    expect(
      versions.filter((version) => version.status === 'active'),
    ).toHaveLength(1);
    expect(
      versions.find((version) => version.status === 'active')?.id,
    ).not.toBe(first.id);
    const rows = await database.orm.execute(
      'SELECT carrier_code FROM shipping_localities WHERE active',
    );
    expect(rows).toMatchObject([{ carrier_code: '08001000' }]);
  });
  it('rejects an invalid source without changing live municipalities', async () => {
    const first = await service.preview(source, '99envios_document', 'owner');
    await service.publish(first.id, 'owner');
    await expect(
      service.preview('not a locality', '99envios_document', 'owner'),
    ).rejects.toMatchObject({ code: 'invalid_source' });
    expect(
      (await service.list()).filter((version) => version.status === 'active'),
    ).toHaveLength(1);
  });
});
