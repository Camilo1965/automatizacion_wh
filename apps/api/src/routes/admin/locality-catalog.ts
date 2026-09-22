import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuditService } from '../../modules/audit/audit-service.js';
import {
  LocalityCatalogError,
  type LocalityCatalogService,
} from '../../modules/localities/locality-catalog-service.js';

export function registerLocalityCatalogRoutes(
  app: FastifyInstance,
  service: LocalityCatalogService,
  authenticate: (
    request: FastifyRequest,
  ) => Promise<{ id?: string; username: string }>,
  auditService?: AuditService,
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
      const versions = await service.publish(
        body.id,
        user.username,
        body.restore,
      );
      await auditService?.record({
        action: 'locality_catalog.published',
        result: 'success',
        actorUserId: user.id ?? null,
        actorUsername: user.username,
        targetType: 'locality_catalog',
        targetId: body.id,
        correlationId: request.id,
        metadata: {
          restore: body.restore === true,
        },
      });
      return { data: { versions } };
    } catch (error) {
      if (error instanceof LocalityCatalogError) {
        await auditService?.record({
          action: 'locality_catalog.published',
          result: 'failure',
          actorUserId: user.id ?? null,
          actorUsername: user.username,
          targetType: 'locality_catalog',
          targetId: body.id,
          correlationId: request.id,
          metadata: { errorCode: error.code },
        });
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });
}
