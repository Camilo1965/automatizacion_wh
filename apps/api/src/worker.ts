import { createRuntime } from './runtime.js';
import { WorkerHealthMonitor } from './modules/health/worker-health.js';
import { refreshOperationalGauges } from './modules/observability/collect-gauges.js';
import { startMetricsServer } from './modules/observability/metrics-server.js';

async function main(): Promise<void> {
  const runtime = await createRuntime();
  const health = new WorkerHealthMonitor();
  const log = (message: string, error?: unknown): void => {
    if (error === undefined) {
      console.error(message);
    } else {
      console.error(message, error);
    }
  };

  const pulse = (): void => {
    health.recordHeartbeat();
    runtime.metrics.setWorkerHeartbeat(Date.now() / 1000);
    runtime.metrics.setWorkerHeartbeatAgeSeconds(0);
    void health.persist().catch((error: unknown) => {
      log('Worker health persist failed', error);
    });
  };

  const metricsServer =
    runtime.config.metricsEnabled === false
      ? null
      : startMetricsServer({
          metrics: runtime.metrics,
          port: runtime.config.workerMetricsPort ?? 9091,
          ...(runtime.config.metricsToken === undefined
            ? {}
            : { token: runtime.config.metricsToken }),
          onRefresh: async () => {
            await refreshOperationalGauges({
              metrics: runtime.metrics,
              database: runtime.database,
              ...(runtime.config.backupMetricsPath === undefined
                ? {}
                : { backupMetricsPath: runtime.config.backupMetricsPath }),
            });
          },
        });

  const stop = runtime.workers.start(
    (message, error) => {
      log(message, error);
      if (error !== undefined) {
        void runtime.errorReporter.report(error, {
          tags: { surface: 'worker' },
        });
      }
    },
    {
      onSchedulerReady: () => {
        health.markSchedulerInitialized();
      },
      onLoopHeartbeat: pulse,
    },
  );

  console.info('KAIRO worker started');

  const shutdown = (signal: NodeJS.Signals): void => {
    console.info(`shutting down worker (${signal})`);
    stop();
    metricsServer?.close();
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
