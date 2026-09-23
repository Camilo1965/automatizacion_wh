import type { FastifyInstance } from 'fastify';
import {
  CustomerIdParamsSchema,
  CustomerListQuerySchema,
  CustomerReconciliationQuerySchema,
} from '@camila/contracts';

import { CatalogNotFoundError } from '../../modules/catalog/catalog-errors.js';
import type { CustomerService } from '../../modules/customers/customer-service.js';
import type { AdminAuthenticate } from './admin-shared.js';

export async function registerCustomerRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    customerService: CustomerService;
  },
): Promise<void> {
  const { authenticate, customerService } = dependencies;

  app.get('/customers', async (request, reply) => {
    await authenticate(request);
    const query = CustomerListQuerySchema.parse(request.query);
    return reply.status(200).send({
      data: await customerService.list({
        limit: query.limit,
        ...(query.segment === undefined ? {} : { segment: query.segment }),
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
    });
  });

  app.get('/customers/reconciliation', async (request, reply) => {
    await authenticate(request);
    const { limit } = CustomerReconciliationQuerySchema.parse(request.query);
    return reply
      .status(200)
      .send({ data: await customerService.reconciliation(limit) });
  });

  app.get('/customers/:customerId', async (request, reply) => {
    await authenticate(request);
    const { customerId } = CustomerIdParamsSchema.parse(request.params);
    const customer = await customerService.get(customerId);
    if (customer === null)
      throw new CatalogNotFoundError('Customer was not found');
    return reply.status(200).send({ data: customer });
  });
}
