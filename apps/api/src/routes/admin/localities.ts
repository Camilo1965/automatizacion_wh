import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { LocalityService } from '../../modules/localities/locality-service.js';
import type { AdminAuthenticate } from './admin-shared.js';

export async function registerLocalitiesRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    localityService: LocalityService;
  },
): Promise<void> {
  const { authenticate, localityService } = dependencies;
  app.get('/localities/departments', async (request, reply) => {
    await authenticate(request);
    return reply.status(200).send({
      data: { items: await localityService.listDepartments() },
    });
  });

  app.get('/localities', async (request, reply) => {
    await authenticate(request);
    const query = z
      .object({
        query: z.string().trim().min(1).max(120).optional(),
        department: z.string().trim().min(1).max(100).optional(),
        afterCode: z.string().min(1).max(32).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(request.query);
    const page = await localityService.list({
      limit: query.limit,
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.department === undefined
        ? {}
        : { department: query.department }),
      ...(query.afterCode === undefined ? {} : { afterCode: query.afterCode }),
    });
    return reply.status(200).send({ data: page });
  });
}
