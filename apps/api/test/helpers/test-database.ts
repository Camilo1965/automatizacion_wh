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
