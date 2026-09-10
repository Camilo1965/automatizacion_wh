import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { DashboardService } from '../../modules/dashboard/dashboard-service.js';

export async function registerDashboardRoute(
  app: FastifyInstance,
  dependencies: {
    dashboardService: DashboardService;
    authenticate: (request: FastifyRequest) => Promise<unknown>;
  },
): Promise<void> {
  app.get('/dashboard', async (request, reply) => {
    await dependencies.authenticate(request);
    return reply.status(200).send({
      data: await dependencies.dashboardService.getSummary(),
    });
  });
}
