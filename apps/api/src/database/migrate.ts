import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsFolder = path.resolve(moduleDirectory, '../../drizzle');

export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = defaultMigrationsFolder,
): Promise<void> {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    onnotice: () => {
      // Expected migrator / PostgreSQL notices (e.g. extension/exists) are fine.
    },
  });

  try {
    const orm = drizzle(sql);
    await migrate(orm, { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  await runMigrations(databaseUrl);
}

const executedAsCli = process.argv[1]?.includes('migrate') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Migration failed');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  });
}
