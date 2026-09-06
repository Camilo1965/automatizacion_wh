import postgres from 'postgres';

import type { DatabaseHealth } from '../contracts/database-health.js';

export function createPostgresHealth(databaseUrl: string): DatabaseHealth {
  const sql = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return {
    async ping(): Promise<void> {
      await sql`SELECT 1`;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
