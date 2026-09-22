import { createRuntime } from './runtime.js';

async function main(): Promise<void> {
  const runtime = await createRuntime();
  const log = (message: string, error?: unknown): void => {
    if (error === undefined) {
      console.error(message);
      return;
    }
    console.error(message, error);
  };

  const stop = runtime.workers.start((message, error) => {
    log(message, error);
  });

  console.info('KAIRO worker started');

  const shutdown = (signal: NodeJS.Signals): void => {
    console.info(`shutting down worker (${signal})`);
    stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start worker');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
