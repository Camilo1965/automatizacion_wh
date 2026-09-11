import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

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
    const { range } = z
      .object({ range: z.enum(['today', '7d', '30d']).default('today') })
      .parse(request.query);
    return reply.status(200).send({
      data: await dependencies.dashboardService.getSummary(range),
    });
  });
}
