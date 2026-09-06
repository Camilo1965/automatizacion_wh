import postgres from 'postgres';

export function requireTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL is required for integration tests. Start the test database with: docker compose --profile test up -d postgres-test',
    );
  }

  assertTestDatabaseName(testDatabaseUrl);
  return testDatabaseUrl;
}

export function assertTestDatabaseName(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'Refusing to mutate a database whose name does not end with _test',
    );
  }
}

function replaceDatabaseName(
  databaseUrl: string,
  databaseName: string,
): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function createTemporaryTestDatabase(
  adminDatabaseUrl: string,
): Promise<{ databaseName: string; databaseUrl: string }> {
  assertTestDatabaseName(adminDatabaseUrl);

  const databaseName = `camila_upgrade_${Date.now()}_${process.pid}_test`;
  if (!databaseName.endsWith('_test')) {
    throw new Error('Temporary database name must end with _test');
  }

  const sql = postgres(adminDatabaseUrl, { max: 1, prepare: false });
  try {
    await sql.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }

  return {
    databaseName,
    databaseUrl: replaceDatabaseName(adminDatabaseUrl, databaseName),
  };
}

export async function dropTemporaryTestDatabase(
  adminDatabaseUrl: string,
  databaseName: string,
): Promise<void> {
  assertTestDatabaseName(adminDatabaseUrl);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'Refusing to drop a database whose name does not end with _test',
    );
  }

  const sql = postgres(adminDatabaseUrl, { max: 1, prepare: false });
  try {
    await sql`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${databaseName}
        AND pid <> pg_backend_pid()
    `;
    await sql.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function resetCatalogTables(databaseUrl: string): Promise<void> {
  assertTestDatabaseName(databaseUrl);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`
      TRUNCATE TABLE inventory_movements, catalog_stock, catalog_references
      RESTART IDENTITY CASCADE
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
