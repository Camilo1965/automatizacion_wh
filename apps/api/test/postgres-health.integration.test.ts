import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresHealth } from '../src/infrastructure/postgres-health.js';
import type { DatabaseHealth } from '../src/contracts/database-health.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
  throw new Error(
    'TEST_DATABASE_URL is required for integration tests. Start the test database with: docker compose --profile test up -d postgres-test',
  );
}

describe('createPostgresHealth', () => {
  let database: DatabaseHealth;

  beforeAll(() => {
    database = createPostgresHealth(testDatabaseUrl);
  });

  afterAll(async () => {
    await database.close();
  });

  it('pings PostgreSQL with a real SELECT 1', async () => {
    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('closes the connection pool cleanly', async () => {
    const disposable = createPostgresHealth(testDatabaseUrl);
    await expect(disposable.ping()).resolves.toBeUndefined();
    await expect(disposable.close()).resolves.toBeUndefined();
  });
});
