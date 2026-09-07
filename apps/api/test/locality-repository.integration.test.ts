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
    await database.orm.execute('TRUNCATE TABLE shipping_localities');
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
});
