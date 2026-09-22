import type { FastifyInstance } from 'fastify';
import {
  ConfirmOrderBodySchema,
  CreateOrderBodySchema,
  PatchOrderBodySchema,
} from '@camila/contracts';
import { z } from 'zod';

import {
  toPublicOrder,
  toPublicOrderSummary,
} from '../../http/admin-mappers.js';
import { CatalogNotFoundError } from '../../modules/catalog/catalog-errors.js';
import type { OrderService } from '../../modules/orders/order-service.js';
import { OrderIdParamsSchema, type AdminAuthenticate } from './admin-shared.js';

export async function registerOrdersRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    orderService: OrderService;
  },
): Promise<void> {
  const { authenticate, orderService } = dependencies;
  app.post('/orders', async (request, reply) => {
    const user = await authenticate(request);
    const body = CreateOrderBodySchema.parse(request.body);
    const order = await orderService.create({
      referenceId: body.referenceId,
      size: body.size,
      quantity: body.quantity,
      adminUserId: user.id,
      ...(body.customerName === undefined
        ? {}
        : { customerName: body.customerName }),
      ...(body.customerPhone === undefined
        ? {}
        : { customerPhone: body.customerPhone }),
      ...(body.address === undefined ? {} : { address: body.address }),
      ...(body.localityCarrierCode === undefined
        ? {}
        : { localityCarrierCode: body.localityCarrierCode }),
      ...(body.deliveryNotes === undefined
        ? {}
        : { deliveryNotes: body.deliveryNotes }),
    });
    return reply.status(201).send({ data: toPublicOrder(order) });
  });

  app.get('/orders', async (request, reply) => {
    await authenticate(request);
    const query = z
      .object({
        status: z
          .enum([
            'draft',
            'confirmed',
            'cancelled',
            'dispatched',
            'delivered',
            'returned',
          ])
          .optional(),
        view: z
          .enum(['incidents', 'ready_to_dispatch', 'awaiting_confirmation'])
          .optional(),
        cursorCreatedAt: z.string().datetime().optional(),
        cursorId: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .refine(
        (value) =>
          (value.cursorCreatedAt === undefined) ===
          (value.cursorId === undefined),
        {
          message: 'Both cursorCreatedAt and cursorId are required',
        },
      )
      .parse(request.query);
    const page = await orderService.list({
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.view === undefined ? {} : { view: query.view }),
      ...(query.cursorCreatedAt === undefined
        ? {}
        : {
            after: {
              createdAt: new Date(query.cursorCreatedAt),
              id: query.cursorId!,
            },
          }),
    });
    return reply.status(200).send({
      data: {
        items: page.items.map(toPublicOrder),
        nextCursor: page.nextCursor,
      },
    });
  });

  app.get('/orders/:orderId', async (request, reply) => {
    await authenticate(request);
    const { orderId } = OrderIdParamsSchema.parse(request.params);
    const order = await orderService.get(orderId);
    if (order === null) throw new CatalogNotFoundError('Order was not found');
    return reply.status(200).send({ data: toPublicOrder(order) });
  });

  app.patch('/orders/:orderId', async (request, reply) => {
    const user = await authenticate(request);
    const { orderId } = OrderIdParamsSchema.parse(request.params);
    const body = PatchOrderBodySchema.parse(request.body);
    const order = await orderService.update({
      orderId,
      adminUserId: user.id,
      ...(body.customerName === undefined
        ? {}
        : { customerName: body.customerName }),
      ...(body.customerPhone === undefined
        ? {}
        : { customerPhone: body.customerPhone }),
      ...(body.address === undefined ? {} : { address: body.address }),
      ...(body.localityCarrierCode === undefined
        ? {}
        : { localityCarrierCode: body.localityCarrierCode }),
      ...(body.deliveryNotes === undefined
        ? {}
        : { deliveryNotes: body.deliveryNotes }),
    });
    return reply.status(200).send({ data: toPublicOrder(order) });
  });

  app.post('/orders/:orderId/summaries', async (request, reply) => {
    await authenticate(request);
    const { orderId } = OrderIdParamsSchema.parse(request.params);
    return reply.status(201).send({
      data: toPublicOrderSummary(await orderService.createSummary(orderId)),
    });
  });

  for (const action of ['cancel', 'dispatch', 'deliver', 'return'] as const) {
    app.post(`/orders/:orderId/${action}`, async (request, reply) => {
      const user = await authenticate(request);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const order = await orderService.transition({
        orderId,
        action,
        adminUserId: user.id,
      });
      return reply.status(200).send({ data: toPublicOrder(order) });
    });
  }

  app.post('/orders/:orderId/confirm', async (request, reply) => {
    const user = await authenticate(request);
    const { orderId } = OrderIdParamsSchema.parse(request.params);
    const body = ConfirmOrderBodySchema.parse(request.body);
    const order = await orderService.transition({
      orderId,
      action: 'confirm',
      adminUserId: user.id,
      ...body,
    });
    return reply.status(200).send({ data: toPublicOrder(order) });
  });
}
