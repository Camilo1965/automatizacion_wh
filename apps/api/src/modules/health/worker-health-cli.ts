import postgres from 'postgres';

import {
  DEFAULT_WORKER_HEALTH_FILE,
  runWorkerHealthCheck,
} from './worker-health.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl === '') {
    process.exit(1);
  }

  const healthFilePath =
    process.env.WORKER_HEALTH_FILE?.trim() || DEFAULT_WORKER_HEALTH_FILE;

  const exitCode = await runWorkerHealthCheck({
    healthFilePath,
    pingDatabase: async () => {
      const sql = postgres(databaseUrl, {
        max: 1,
        connect_timeout: 5,
        idle_timeout: 5,
      });
      try {
        await sql`select 1`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  });

  process.exit(exitCode);
}

main().catch(() => {
  process.exit(1);
});
