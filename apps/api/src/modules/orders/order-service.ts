import type { CatalogReference } from '../catalog/catalog-types.js';
import { CatalogNotFoundError } from '../catalog/catalog-errors.js';
import { assertTransition, type OrderAction } from './order-state.js';
import { OrderConflictError, OrderValidationError } from './order-errors.js';
import type {
  CreateOrderInput,
  OrderListInput,
  OrderPage,
  OrderRecord,
  OrderSummary,
  PatchOrderInput,
} from './order-types.js';

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<OrderRecord>;
  find(orderId: string): Promise<OrderRecord | null>;
  list(input: OrderListInput): Promise<OrderPage>;
  update(input: PatchOrderInput): Promise<OrderRecord>;
  createSummary(orderId: string): Promise<OrderSummary>;
  transition(
    input: Readonly<{
      orderId: string;
      action: OrderAction;
      adminUserId: string;
      summaryVersion?: number;
      idempotencyKey?: string;
    }>,
  ): Promise<OrderRecord>;
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly findReference: (
      referenceId: string,
    ) => Promise<CatalogReference | null>,
  ) {}

  async create(input: CreateOrderInput): Promise<OrderRecord> {
    const reference = await this.findReference(input.referenceId);
    if (reference === null)
      throw new CatalogNotFoundError('Catalog reference was not found');
    if (!reference.active)
      throw new OrderConflictError(
        'reference_inactive',
        'The catalog reference is inactive',
      );
    return this.repository.create(input);
  }

  get(orderId: string): Promise<OrderRecord | null> {
    return this.repository.find(orderId);
  }
  list(input: OrderListInput): Promise<OrderPage> {
    return this.repository.list(input);
  }

  async update(input: PatchOrderInput): Promise<OrderRecord> {
    const order = await this.requireOrder(input.orderId);
    if (order.status !== 'draft')
      throw new OrderConflictError(
        'order_not_editable',
        'Only draft orders can be edited',
      );
    return this.repository.update(input);
  }

  async createSummary(orderId: string): Promise<OrderSummary> {
    const order = await this.requireOrder(orderId);
    if (order.status !== 'draft')
      throw new OrderConflictError(
        'summary_not_available',
        'Only draft orders can be summarized',
      );
    this.assertComplete(order);
    return this.repository.createSummary(orderId);
  }

  async transition(
    input: Readonly<{
      orderId: string;
      action: OrderAction;
      adminUserId: string;
      summaryVersion?: number;
      idempotencyKey?: string;
    }>,
  ): Promise<OrderRecord> {
    const order = await this.requireOrder(input.orderId);
    if (input.action === 'confirm' && order.status === 'confirmed') {
      if (input.idempotencyKey === undefined) {
        throw new OrderValidationError(
          'body',
          'confirmation_required',
          'A summary version and idempotency key are required',
        );
      }
      return this.repository.transition(input);
    }
    assertTransition(order.status, input.action);
    if (input.action === 'confirm') {
      if (
        input.summaryVersion === undefined ||
        input.idempotencyKey === undefined
      ) {
        throw new OrderValidationError(
          'body',
          'confirmation_required',
          'A summary version and idempotency key are required',
        );
      }
      this.assertComplete(order);
    }
    return this.repository.transition(input);
  }

  private async requireOrder(orderId: string): Promise<OrderRecord> {
    const order = await this.repository.find(orderId);
    if (order === null)
      throw new OrderConflictError('order_not_found', 'Order was not found');
    return order;
  }

  private assertComplete(order: OrderRecord): void {
    if (
      order.customer.name === null ||
      order.customer.phone === null ||
      order.destination.address === null ||
      order.destination.localityCarrierCode === null
    ) {
      throw new OrderValidationError(
        'order',
        'incomplete_order',
        'Customer and destination details are required before confirmation',
      );
    }
  }
}
