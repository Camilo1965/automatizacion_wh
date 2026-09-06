import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createPostgresDatabase } from './database/client.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const database = createPostgresDatabase(config.databaseUrl);
  const app = await buildApp({ config, database });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start API');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
