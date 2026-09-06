import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresDatabase,
  type PostgresDatabase,
} from '../src/database/client.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
  throw new Error(
    'TEST_DATABASE_URL is required for integration tests. Start the test database with: docker compose --profile test up -d postgres-test',
  );
}

describe('createPostgresDatabase', () => {
  let database: PostgresDatabase;

  beforeAll(() => {
    database = createPostgresDatabase(testDatabaseUrl);
  });

  afterAll(async () => {
    await database.close();
  });

  it('pings PostgreSQL with a real SELECT 1', async () => {
    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('exposes a Drizzle orm instance', () => {
    expect(database.orm).toBeDefined();
  });

  it('closes the connection pool cleanly and idempotently', async () => {
    const disposable = createPostgresDatabase(testDatabaseUrl);
    await expect(disposable.ping()).resolves.toBeUndefined();
    await expect(disposable.close()).resolves.toBeUndefined();
    await expect(disposable.close()).resolves.toBeUndefined();
  });
});
