import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GlobalSearchQuerySchema } from '@camila/contracts';

import type { GlobalSearchService } from '../../modules/search/global-search-service.js';

export async function registerGlobalSearchRoute(
  app: FastifyInstance,
  dependencies: {
    globalSearchService: GlobalSearchService;
    authenticate: (request: FastifyRequest) => Promise<unknown>;
  },
): Promise<void> {
  app.get('/search', async (request, reply) => {
    await dependencies.authenticate(request);
    const query = GlobalSearchQuerySchema.parse(request.query);
    const items = await dependencies.globalSearchService.search(query);
    return reply.status(200).send({ data: { items } });
  });
}
