import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  LocalityCatalogError,
  type LocalityCatalogService,
} from '../../modules/localities/locality-catalog-service.js';
export function registerLocalityCatalogRoutes(
  app: FastifyInstance,
  service: LocalityCatalogService,
  authenticate: (request: FastifyRequest) => Promise<{ username: string }>,
) {
  app.get('/locality-catalog', async (request) => {
    await authenticate(request);
    return { data: { versions: await service.list() } };
  });
  app.post('/locality-catalog/preview', async (request, reply) => {
    const user = await authenticate(request);
    const body = z
      .object({
        source: z.string().min(1).max(500000),
        format: z.enum(['csv', '99envios_document']),
      })
      .strict()
      .parse(request.body);
    try {
      return {
        data: await service.preview(body.source, body.format, user.username),
      };
    } catch (error) {
      if (error instanceof LocalityCatalogError)
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });
  app.post('/locality-catalog/publish', async (request, reply) => {
    const user = await authenticate(request);
    const body = z
      .object({ id: z.uuid(), restore: z.boolean().optional() })
      .strict()
      .parse(request.body);
    try {
      return {
        data: {
          versions: await service.publish(body.id, user.username, body.restore),
        },
      };
    } catch (error) {
      if (error instanceof LocalityCatalogError)
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });
}
