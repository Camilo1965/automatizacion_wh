import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { DatabaseHealth } from '../contracts/database-health.js';
import { schema } from './schema.js';

export interface PostgresDatabase extends DatabaseHealth {
  readonly orm: PostgresJsDatabase<typeof schema>;
}

export function createPostgresDatabase(databaseUrl: string): PostgresDatabase {
  const sql = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  const orm = drizzle(sql, { schema });
  let closed = false;

  return {
    orm,
    async ping(): Promise<void> {
      await sql`SELECT 1`;
    },
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await sql.end({ timeout: 5 });
    },
  };
}
