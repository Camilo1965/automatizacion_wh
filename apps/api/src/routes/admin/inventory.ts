import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuditService } from '../../modules/audit/audit-service.js';
import type { InventoryClosureService } from '../../modules/inventory/inventory-closure-service.js';
import { toPublicClosure, type AdminAuthenticate } from './admin-shared.js';

export async function registerInventoryRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    inventoryClosureService: InventoryClosureService;
    auditService?: AuditService;
  },
): Promise<void> {
  const { authenticate, inventoryClosureService, auditService } = dependencies;
  app.get('/inventory/closures', async (request, reply) => {
    await authenticate(request);
    const items = await inventoryClosureService.list();
    return reply.status(200).send({
      data: { items: items.map(toPublicClosure) },
    });
  });
  app.post('/inventory/closures/:date/generate', async (request, reply) => {
    const user = await authenticate(request);
    const date = z.iso.date().parse((request.params as { date: string }).date);
    const closure = await inventoryClosureService.generate(date);
    await auditService?.record({
      action: 'inventory.closure_generated',
      result: 'success',
      actorUserId: user.id,
      actorUsername: user.username,
      targetType: 'inventory_closure',
      targetId: (closure as { id: string }).id,
      correlationId: request.id,
      metadata: { businessDate: date },
    });
    return reply.status(201).send({
      data: toPublicClosure(closure),
    });
  });
  app.get('/inventory/closures/:id/download', async (request, reply) => {
    const user = await authenticate(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    const closure = (await inventoryClosureService.findById(id)) as {
      businessDate: string;
      csvContent: string;
    } | null;
    if (closure === null)
      return reply.status(404).send({
        error: {
          code: 'closure_not_found',
          message: 'Closure was not found',
        },
      });
    await auditService?.record({
      action: 'data.exported',
      result: 'success',
      actorUserId: user.id,
      actorUsername: user.username,
      targetType: 'inventory_closure',
      targetId: id,
      correlationId: request.id,
      metadata: { kind: 'treinta_csv', businessDate: closure.businessDate },
    });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="treinta-${closure.businessDate}.csv"`,
      )
      .send(closure.csvContent);
  });
  app.post('/inventory/closures/:id/acknowledge', async (request, reply) => {
    const user = await authenticate(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    const closure = await inventoryClosureService.acknowledge(id);
    await auditService?.record({
      action: 'inventory.closure_acknowledged',
      result: 'success',
      actorUserId: user.id,
      actorUsername: user.username,
      targetType: 'inventory_closure',
      targetId: id,
      correlationId: request.id,
    });
    return reply.status(200).send({
      data: toPublicClosure(closure),
    });
  });
  app.post('/inventory/closures/:id/reopen', async (request, reply) => {
    await authenticate(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(250) })
      .strict()
      .parse(request.body);
    return reply.status(201).send({
      data: toPublicClosure(await inventoryClosureService.reopen(id, reason)),
    });
  });
}
