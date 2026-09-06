import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => {
    return { status: 'ok' as const };
  });

  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.database.ping();
      return {
        status: 'ready' as const,
        checks: {
          database: 'up' as const,
        },
      };
    } catch {
      return reply.status(503).send({
        status: 'not_ready',
        checks: {
          database: 'down',
        },
      });
    }
  });
};
