import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ShippingIncidentService } from '../../modules/shipping/shipping-incident-service.js';
export function registerShippingIncidentRoutes(
  app: FastifyInstance,
  service: ShippingIncidentService,
  authenticate: (request: FastifyRequest) => Promise<{ username: string }>,
) {
  app.get('/shipping/incidents', async (request) => {
    await authenticate(request);
    return { data: { incidents: await service.list() } };
  });
  app.post('/shipping/incidents/sync', async (request, reply) => {
    await authenticate(request);
    try {
      return { data: { incidents: await service.sync() } };
    } catch {
      return reply.code(502).send({
        error: {
          code: 'incident_sync_failed',
          message:
            'No se pudieron consultar las novedades. Revisa la conexión y la sucursal configurada.',
        },
      });
    }
  });
  app.post('/shipping/incidents/:id/respond', async (request, reply) => {
    const user = await authenticate(request);
    const { id } = z
      .object({ id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = z
      .object({
        description: z.string().trim().min(3).max(2000),
        observations: z.string().max(2000),
      })
      .strict()
      .parse(request.body);
    try {
      return {
        data: {
          incidents: await service.respond(
            id,
            body.description,
            body.observations,
            user.username,
          ),
        },
      };
    } catch {
      return reply.code(409).send({
        error: {
          code: 'incident_response_failed',
          message:
            'No se pudo confirmar la respuesta. Recarga las novedades y revisa el estado antes de volver a intentar.',
        },
      });
    }
  });
}
