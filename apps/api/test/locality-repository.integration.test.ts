import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresLocalityRepository } from '../src/modules/localities/postgres-locality-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();

describe('locality repository integration', () => {
  const database = createPostgresDatabase(testDatabaseUrl);
  const repository = new PostgresLocalityRepository(database);

  beforeAll(async () => runMigrations(testDatabaseUrl));
  beforeEach(async () => {
    await database.orm.execute(
      'TRUNCATE TABLE shipping_locality_imports, shipping_localities',
    );
  });
  afterAll(async () => database.close());

  const localities = [
    {
      carrierCode: '001',
      department: 'Antioquia',
      locality: 'Medellín',
      normalizedName: 'medellin',
      country: 'CO' as const,
    },
    {
      carrierCode: '002',
      department: 'Cundinamarca',
      locality: 'Bogotá D.C.',
      normalizedName: 'bogota d.c.',
      country: 'CO' as const,
    },
  ];

  it('replaces data atomically and treats the same source as unchanged', async () => {
    await expect(
      repository.replaceAll({ localities, sourceSha256: 'a'.repeat(64) }),
    ).resolves.toEqual({ imported: 2, unchanged: false });
    await expect(
      repository.replaceAll({ localities, sourceSha256: 'a'.repeat(64) }),
    ).resolves.toEqual({ imported: 0, unchanged: true });

    await expect(
      repository.list({ limit: 25, query: 'medellin' }),
    ).resolves.toEqual({ items: [localities[0]], nextAfterCode: null });
  });

  it('paginates deterministically by carrier code', async () => {
    await repository.replaceAll({ localities, sourceSha256: 'b'.repeat(64) });

    const first = await repository.list({ limit: 1 });
    const second = await repository.list({
      limit: 1,
      afterCode: first.items[0]!.carrierCode,
    });

    expect(first.items.map((item) => item.carrierCode)).toEqual(['001']);
    expect(first.nextAfterCode).toBe('001');
    expect(second.items.map((item) => item.carrierCode)).toEqual(['002']);
    expect(second.nextAfterCode).toBeNull();
  });

  it('keeps a historical locality inactive instead of deleting it on a later import', async () => {
    await repository.replaceAll({ localities, sourceSha256: 'c'.repeat(64) });
    await repository.replaceAll({
      localities: [localities[0]!],
      sourceSha256: 'd'.repeat(64),
    });

    await expect(repository.list({ limit: 25 })).resolves.toEqual({
      items: [localities[0]],
      nextAfterCode: null,
    });
    const [historical] = await database.orm.execute<{
      active: boolean;
    }>(
      "SELECT active FROM shipping_localities WHERE carrier_code = '002'",
    );
    expect(historical?.active).toBe(false);
  });

  it('records source import warnings without rejecting valid localities', async () => {
    await repository.replaceAll({
      localities: [localities[0]!],
      sourceSha256: 'e'.repeat(64),
      sourceType: '99envios_document',
      issues: [{ row: 7, code: 'invalid_dane' }],
    });
    const [audit] = await database.orm.execute<{ issues: unknown }>(
      "SELECT issues FROM shipping_locality_imports WHERE source_sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'",
    );
    expect(audit?.issues).toEqual([{ row: 7, code: 'invalid_dane' }]);
  });
});
