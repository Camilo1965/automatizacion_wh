import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';

import type { AppConfig } from './config.js';
import type { DatabaseHealth } from './contracts/database-health.js';
import { healthRoutes } from './routes/health.js';

export type AppDependencies = Readonly<{
  config: AppConfig;
  database: DatabaseHealth;
}>;

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseHealth;
  }
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    logger: {
      level: dependencies.config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    },
  });

  app.decorate('database', dependencies.database);

  await app.register(helmet);
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === dependencies.config.adminOrigin);
    },
  });

  await app.register(healthRoutes);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error({ err: error }, 'request failed');
      return reply.status(statusCode).send({
        statusCode,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: error.message,
    });
  });

  let databaseClosed = false;
  app.addHook('onClose', async () => {
    if (databaseClosed) {
      return;
    }
    databaseClosed = true;
    await dependencies.database.close();
  });

  return app;
}
