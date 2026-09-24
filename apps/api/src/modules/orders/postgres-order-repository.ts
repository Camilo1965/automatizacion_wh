import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { ShippingPolicySchema } from '@camila/contracts';

import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  customers,
  catalogStock,
  inventoryMovements,
  orderConfirmations,
  orderStatusEvents,
  orderSummaries,
  reservationMovements,
  salesOrders,
  shippingGuideJobs,
  ownerAlerts,
  shippingLocalities,
  shippingQuotes,
} from '../../database/schema/index.js';
import { parseShoeSize } from '../catalog/catalog-validation.js';
import { isEligibleCarrierQuote } from '../shipping/shipping-selection.js';
import {
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
} from './order-errors.js';
import { assertTransition, type OrderAction } from './order-state.js';
import type { OrderRepository } from './order-service.js';
import type {
  CreateOrderInput,
  OrderListInput,
  OrderPage,
  OrderRecord,
  OrderSummary,
  PatchOrderInput,
} from './order-types.js';
import {
  normalizeColombianPhone,
  validateOrderQuantity,
} from './order-validation.js';
import {
  lockCustomerPhones,
  resolveCustomerContact,
} from '../customers/customer-contact.js';

type Row = typeof salesOrders.$inferSelect;
type ReferenceRow = typeof catalogReferences.$inferSelect;
type ShippingQuoteRow = typeof shippingQuotes.$inferSelect;
type OrderTransaction = Parameters<
  Parameters<PostgresDatabase['orm']['transaction']>[0]
>[0];

function nullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function mapOrder(row: Row, reference: ReferenceRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status as OrderRecord['status'],
    referenceId: row.referenceId,
    referenceCode: reference.code,
    referenceModelName: reference.modelName,
    referenceColor: reference.color,
    unitPriceCop: reference.priceCop,
    size: parseShoeSize(row.size),
    quantity: row.quantity,
    customer: { name: row.customerName, phone: row.customerPhone },
    destination: {
      address: row.address,
      localityCarrierCode: row.localityCarrierCode,
      localityDepartment: row.localityDepartment,
      localityName: row.localityName,
      deliveryNotes: row.deliveryNotes,
    },
    draftVersion: row.draftVersion,
    latestSummaryVersion: row.latestSummaryVersion,
    confirmedSummaryVersion: row.confirmedSummaryVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function completeOrder(row: Row): void {
  if (
    row.customerName === null ||
    row.customerPhone === null ||
    row.address === null ||
    row.localityCarrierCode === null ||
    row.localityDepartment === null ||
    row.localityName === null
  ) {
    throw new OrderValidationError(
      'order',
      'incomplete_order',
      'Customer and destination details are required before confirmation',
    );
  }
}

function assertSelectedQuotePolicy(quote: ShippingQuoteRow): void {
  const quotedPolicy = ShippingPolicySchema.safeParse(quote.policySnapshot);
  if (!quotedPolicy.success)
    throw new OrderConflictError(
      'shipping_quote_requires_requote',
      'Esta cotización necesita actualizarse. Cotiza de nuevo antes de continuar.',
    );
  if (!isEligibleCarrierQuote(quote, quotedPolicy.data))
    throw new OrderConflictError(
      'shipping_quote_not_allowed',
      'Esta transportadora no está permitida por la política de envío. Cotiza de nuevo.',
    );
}

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async create(input: CreateOrderInput): Promise<OrderRecord> {
    const size = parseShoeSize(input.size);
    const quantity = validateOrderQuantity(input.quantity);
    const locality = await this.findLocality(input.localityCarrierCode);
    const normalizedPhone =
      input.customerPhone === undefined || input.customerPhone === null
        ? null
        : normalizeColombianPhone(input.customerPhone);
    const [created] = await this.database.orm.transaction(async (tx) => {
      let customerId: string | null = null;
      if (normalizedPhone !== null) {
        customerId = await resolveCustomerContact(tx, {
          normalizedPhone,
          ...(input.customerName === undefined
            ? {}
            : { displayName: input.customerName }),
        });
        if (input.customerId != null && input.customerId !== customerId) {
          throw new OrderConflictError(
            'customer_identity_mismatch',
            'El contacto del pedido cambió o requiere revisión.',
          );
        }
      } else if (input.customerId != null) {
        throw new OrderConflictError(
          'customer_phone_required',
          'No se puede vincular el cliente sin un teléfono verificado.',
        );
      }

      const [order] = await tx
        .insert(salesOrders)
        .values({
          referenceId: input.referenceId,
          size,
          quantity,
          customerName: nullable(input.customerName),
          customerPhone: normalizedPhone,
          customerId,
          address: nullable(input.address),
          localityCarrierCode: locality?.carrierCode ?? null,
          localityDepartment: locality?.department ?? null,
          localityName: locality?.locality ?? null,
          deliveryNotes: nullable(input.deliveryNotes),
        })
        .returning();
      if (order === undefined) throw new Error('Failed to create order');
      await tx.insert(orderStatusEvents).values({
        orderId: order.id,
        previousStatus: null,
        nextStatus: 'draft',
        ...(input.adminUserId === undefined
          ? {}
          : { adminUserId: input.adminUserId }),
        createdAt: sql`clock_timestamp()`,
      });
      return [order] as const;
    });
    if (created === undefined) throw new Error('Failed to create order');
    return this.requireMapped(created);
  }

  async find(orderId: string): Promise<OrderRecord | null> {
    const rows = await this.database.orm
      .select({ order: salesOrders, reference: catalogReferences })
      .from(salesOrders)
      .innerJoin(
        catalogReferences,
        eq(salesOrders.referenceId, catalogReferences.id),
      )
      .where(eq(salesOrders.id, orderId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapOrder(row.order, row.reference);
  }

  async list(input: OrderListInput): Promise<OrderPage> {
    const conditions = [];
    if (input.status !== undefined)
      conditions.push(eq(salesOrders.status, input.status));
    if (input.view === 'awaiting_confirmation')
      conditions.push(
        sql`${salesOrders.status} = 'draft' AND ${salesOrders.latestSummaryVersion} > 0`,
      );
    if (input.view === 'ready_to_dispatch')
      conditions.push(sql`EXISTS (
        SELECT 1 FROM shipping_guide_jobs AS jobs
        WHERE jobs.order_id = ${salesOrders.id} AND jobs.status = 'created'
      )`);
    if (input.view === 'incidents')
      conditions.push(sql`EXISTS (
        SELECT 1 FROM shipping_guide_jobs AS jobs
        WHERE jobs.order_id = ${salesOrders.id} AND jobs.status IN ('uncertain', 'failed')
      )`);
    if (input.after !== undefined)
      conditions.push(
        or(
          lt(salesOrders.createdAt, input.after.createdAt),
          and(
            eq(salesOrders.createdAt, input.after.createdAt),
            lt(salesOrders.id, input.after.id),
          ),
        )!,
      );
    const rows = await this.database.orm
      .select({ order: salesOrders, reference: catalogReferences })
      .from(salesOrders)
      .innerJoin(
        catalogReferences,
        eq(salesOrders.referenceId, catalogReferences.id),
      )
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(salesOrders.createdAt), desc(salesOrders.id))
      .limit(input.limit + 1);
    const pageRows = rows.slice(0, input.limit);
    const last = pageRows.at(-1)?.order;
    return {
      items: pageRows.map((row) => mapOrder(row.order, row.reference)),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }

  async update(input: PatchOrderInput): Promise<OrderRecord> {
    const [initialIdentity] = await this.database.orm
      .select({
        customerPhone: salesOrders.customerPhone,
        customerId: salesOrders.customerId,
        profilePhone: customers.normalizedPhone,
      })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(eq(salesOrders.id, input.orderId))
      .limit(1);
    const locality =
      input.localityCarrierCode === undefined
        ? undefined
        : await this.findLocality(input.localityCarrierCode);
    const values: Record<string, unknown> = {
      updatedAt: sql`clock_timestamp()`,
      draftVersion: sql`${salesOrders.draftVersion} + 1`,
    };
    if (input.customerName !== undefined)
      values.customerName = nullable(input.customerName);
    if (input.customerPhone !== undefined)
      values.customerPhone =
        input.customerPhone === null
          ? null
          : normalizeColombianPhone(input.customerPhone);
    if (input.address !== undefined) values.address = nullable(input.address);
    if (input.deliveryNotes !== undefined)
      values.deliveryNotes = nullable(input.deliveryNotes);
    if (locality !== undefined) {
      values.localityCarrierCode = locality?.carrierCode ?? null;
      values.localityDepartment = locality?.department ?? null;
      values.localityName = locality?.locality ?? null;
    }
    const [updated] = await this.database.orm.transaction(async (tx) => {
      await lockCustomerPhones(tx, [
        ...(initialIdentity?.customerPhone == null
          ? []
          : [initialIdentity.customerPhone]),
        ...(initialIdentity?.profilePhone == null
          ? []
          : [initialIdentity.profilePhone]),
        ...(typeof values.customerPhone === 'string'
          ? [values.customerPhone]
          : []),
      ]);
      const [current] = await tx
        .select()
        .from(salesOrders)
        .where(eq(salesOrders.id, input.orderId))
        .limit(1)
        .for('update');
      if (current === undefined || current.status !== 'draft') return [];
      if (
        initialIdentity?.customerPhone !== current.customerPhone ||
        initialIdentity.customerId !== current.customerId
      ) {
        throw new OrderConflictError(
          'customer_identity_mismatch',
          'El contacto del pedido cambió o requiere revisión.',
        );
      }
      if (current.customerId !== null) {
        const [profile] = await tx
          .select({ normalizedPhone: customers.normalizedPhone })
          .from(customers)
          .where(eq(customers.id, current.customerId))
          .limit(1);
        if (
          profile?.normalizedPhone === null &&
          (input.customerPhone !== undefined ||
            [values.customerName, values.address, values.deliveryNotes].some(
              (value) => typeof value === 'string',
            ))
        ) {
          throw new OrderConflictError(
            'customer_identity_mismatch',
            'El contacto del pedido cambió o requiere revisión.',
          );
        }
      }

      const nextPhone =
        input.customerPhone === undefined
          ? current.customerPhone
          : (values.customerPhone as string | null);
      if (
        input.customerPhone !== undefined &&
        nextPhone !== current.customerPhone
      ) {
        // A changed phone is not enough evidence to silently merge identities.
        values.customerId = null;
      } else if (
        current.customerId !== null &&
        nextPhone !== null &&
        input.customerName !== undefined
      ) {
        values.customerId = await resolveCustomerContact(tx, {
          normalizedPhone: nextPhone,
          displayName: input.customerName,
        });
      }

      return tx
        .update(salesOrders)
        .set(values as Partial<typeof salesOrders.$inferInsert>)
        .where(
          and(
            eq(salesOrders.id, input.orderId),
            eq(salesOrders.status, 'draft'),
          ),
        )
        .returning();
    });
    if (updated === undefined)
      throw new OrderConflictError(
        'order_not_editable',
        'Only draft orders can be edited',
      );
    return this.requireMapped(updated);
  }

  async createSummary(orderId: string): Promise<OrderSummary> {
    return this.database.orm.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'draft')
        throw new OrderConflictError(
          'summary_not_available',
          'Only draft orders can be summarized',
        );
      completeOrder(order);
      const reference = await this.reference(order.referenceId, tx);
      const [selectedQuote] = await tx
        .select()
        .from(shippingQuotes)
        .where(
          and(
            eq(shippingQuotes.orderId, order.id),
            eq(shippingQuotes.selected, true),
            eq(shippingQuotes.draftVersion, order.draftVersion),
          ),
        )
        .limit(1)
        .for('update');
      if (selectedQuote !== undefined && selectedQuote.expiresAt <= new Date())
        throw new OrderConflictError(
          'shipping_quote_expired',
          'Generate a new shipping quote before continuing',
        );
      if (selectedQuote !== undefined) assertSelectedQuotePolicy(selectedQuote);
      const version = order.latestSummaryVersion + 1;
      const shippingCostCop =
        selectedQuote === undefined
          ? null
          : selectedQuote.freightCop +
            selectedQuote.cashOnDeliveryCop +
            selectedQuote.surchargeCop +
            selectedQuote.insuranceCop;
      const snapshot = {
        schemaVersion: 1,
        version,
        draftVersion: order.draftVersion,
        orderNumber: `PED-${String(order.orderNumber).padStart(6, '0')}`,
        reference: {
          id: reference.id,
          code: reference.code,
          modelName: reference.modelName,
          color: reference.color,
        },
        size: parseShoeSize(order.size),
        quantity: order.quantity,
        unitPriceCop: reference.priceCop,
        productSubtotalCop: reference.priceCop * order.quantity,
        shippingCostCop,
        shippingPending: selectedQuote === undefined,
        totalCop: reference.priceCop * order.quantity + (shippingCostCop ?? 0),
        ...(selectedQuote === undefined
          ? {}
          : {
              shippingQuote: {
                id: selectedQuote.id,
                carrier: selectedQuote.carrier,
                serviceId: selectedQuote.serviceId,
                freightCop: selectedQuote.freightCop,
                cashOnDeliveryCop: selectedQuote.cashOnDeliveryCop,
                surchargeCop: selectedQuote.surchargeCop,
                insuranceMode: selectedQuote.insuranceMode,
                insuranceCop: selectedQuote.insuranceCop,
                estimatedDays: selectedQuote.estimatedDays,
                expiresAt: selectedQuote.expiresAt.toISOString(),
              },
            }),
        customer: { name: order.customerName, phone: order.customerPhone },
        destination: {
          address: order.address,
          localityCarrierCode: order.localityCarrierCode,
          department: order.localityDepartment,
          locality: order.localityName,
          deliveryNotes: order.deliveryNotes,
        },
      };
      const [summary] = await tx
        .insert(orderSummaries)
        .values({
          orderId,
          version,
          draftVersion: order.draftVersion,
          snapshot,
          createdAt: sql`clock_timestamp()`,
        })
        .returning();
      await tx
        .update(salesOrders)
        .set({
          latestSummaryVersion: version,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(salesOrders.id, orderId));
      if (summary === undefined)
        throw new Error('Failed to create order summary');
      return {
        version: summary.version,
        draftVersion: summary.draftVersion,
        snapshot: summary.snapshot as Record<string, unknown>,
        createdAt: summary.createdAt,
      };
    });
  }

  async transition(
    input: Readonly<{
      orderId: string;
      action: OrderAction;
      adminUserId?: string;
      summaryVersion?: number;
      idempotencyKey?: string;
    }>,
  ): Promise<OrderRecord> {
    return this.database.orm.transaction(async (tx) => {
      const order = await this.lockOrder(tx, input.orderId);
      if (input.action === 'confirm' && order.status === 'confirmed') {
        const [confirmation] = await tx
          .select()
          .from(orderConfirmations)
          .where(
            eq(orderConfirmations.idempotencyKey, input.idempotencyKey ?? ''),
          )
          .limit(1);
        if (confirmation?.orderId === order.id)
          return this.requireMapped(order, tx);
        throw new OrderConflictError(
          'invalid_order_transition',
          'This order was already confirmed',
        );
      }
      const next = assertTransition(
        order.status as OrderRecord['status'],
        input.action,
      );
      if (input.action === 'confirm') {
        completeOrder(order);
        const [summary] = await tx
          .select()
          .from(orderSummaries)
          .where(
            and(
              eq(orderSummaries.orderId, order.id),
              eq(orderSummaries.version, input.summaryVersion!),
            ),
          )
          .limit(1)
          .for('update');
        if (
          summary === undefined ||
          summary.draftVersion !== order.draftVersion
        )
          throw new OrderConflictError(
            'stale_summary',
            'Generate a new summary before confirming',
          );
        const snapshot = summary.snapshot as {
          shippingQuote?: { id: string; carrier: string };
        };
        if (snapshot.shippingQuote === undefined)
          throw new OrderConflictError(
            'shipping_quote_required',
            'Cotiza el envío y genera un nuevo resumen antes de confirmar.',
          );
        let confirmedShippingQuote: ShippingQuoteRow | undefined;
        if (snapshot.shippingQuote !== undefined) {
          [confirmedShippingQuote] = await tx
            .select()
            .from(shippingQuotes)
            .where(
              and(
                eq(shippingQuotes.id, snapshot.shippingQuote.id),
                eq(shippingQuotes.orderId, order.id),
                eq(shippingQuotes.draftVersion, order.draftVersion),
                eq(shippingQuotes.selected, true),
              ),
            )
            .limit(1)
            .for('update');
          if (confirmedShippingQuote === undefined)
            throw new OrderConflictError(
              'shipping_quote_stale',
              'The selected shipping quote changed; generate a new summary',
            );
          if (confirmedShippingQuote.expiresAt <= new Date())
            throw new OrderConflictError(
              'shipping_quote_expired',
              'Generate a new shipping quote before confirming',
            );
          assertSelectedQuotePolicy(confirmedShippingQuote);
        }
        const [stock] = await tx
          .select()
          .from(catalogStock)
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          )
          .limit(1)
          .for('update');
        if (
          stock === undefined ||
          stock.physicalQuantity - stock.reservedQuantity < order.quantity
        )
          throw new OrderConflictError(
            'insufficient_stock',
            'There is not enough stock available',
          );
        const [confirmation] = await tx
          .select()
          .from(orderConfirmations)
          .where(eq(orderConfirmations.idempotencyKey, input.idempotencyKey!))
          .limit(1)
          .for('update');
        if (confirmation !== undefined && confirmation.orderId !== order.id)
          throw new OrderConflictError(
            'idempotency_key_conflict',
            'The idempotency key belongs to another order',
          );
        if (confirmation === undefined)
          await tx.insert(orderConfirmations).values({
            orderId: order.id,
            summaryVersion: summary.version,
            idempotencyKey: input.idempotencyKey!,
            createdAt: sql`clock_timestamp()`,
          });
        await tx
          .update(catalogStock)
          .set({
            reservedQuantity: stock.reservedQuantity + order.quantity,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          );
        await tx.insert(reservationMovements).values({
          orderId: order.id,
          referenceId: order.referenceId,
          size: order.size,
          previousReservedQuantity: stock.reservedQuantity,
          newReservedQuantity: stock.reservedQuantity + order.quantity,
          delta: order.quantity,
          reason: 'confirmed',
          createdAt: sql`clock_timestamp()`,
        });
        await tx
          .update(salesOrders)
          .set({
            status: next,
            confirmedSummaryVersion: summary.version,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(salesOrders.id, order.id));
        if (confirmedShippingQuote !== undefined) {
          await tx
            .insert(shippingGuideJobs)
            .values({
              orderId: order.id,
              quoteId: confirmedShippingQuote.id,
              carrier: confirmedShippingQuote.carrier,
              insuranceMode: confirmedShippingQuote.insuranceMode,
              policySnapshot: confirmedShippingQuote.policySnapshot,
              confirmedTotalCop: (summary.snapshot as { totalCop: number })
                .totalCop,
            })
            .onConflictDoNothing({ target: shippingGuideJobs.orderId });
        }
        await tx
          .insert(ownerAlerts)
          .values({
            type: 'order_confirmed',
            severity: 'info',
            title: 'Pedido confirmado',
            detail: `Pedido PED-${String(order.orderNumber).padStart(6, '0')} · talla ${order.size} · ${order.quantity} unidad(es).`,
            entityUrl: `/orders/${order.id}`,
            deduplicationKey: `order_confirmed:${order.id}`,
            retrySafe: false,
          })
          .onConflictDoNothing();
      } else if (input.action === 'cancel' && order.status === 'confirmed') {
        await this.releaseReservation(tx, order, 'cancelled');
        await tx
          .update(shippingGuideJobs)
          .set({
            status: 'failed',
            errorCode: 'order_cancelled',
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(shippingGuideJobs.orderId, order.id),
              eq(shippingGuideJobs.status, 'pending'),
            ),
          );
        await tx
          .update(salesOrders)
          .set({ status: next, updatedAt: sql`clock_timestamp()` })
          .where(eq(salesOrders.id, order.id));
      } else if (input.action === 'dispatch') {
        const [guide] = await tx
          .select({ id: shippingGuideJobs.id })
          .from(shippingGuideJobs)
          .where(
            and(
              eq(shippingGuideJobs.orderId, order.id),
              eq(shippingGuideJobs.status, 'created'),
            ),
          )
          .limit(1)
          .for('update');
        if (guide === undefined)
          throw new OrderConflictError(
            'shipping_guide_required',
            'Create the shipping guide before dispatching the order',
          );
        const [stock] = await tx
          .select()
          .from(catalogStock)
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          )
          .limit(1)
          .for('update');
        if (
          stock === undefined ||
          stock.reservedQuantity < order.quantity ||
          stock.physicalQuantity < order.quantity
        )
          throw new OrderConflictError(
            'reservation_missing',
            'The order reservation is unavailable',
          );
        await tx
          .update(catalogStock)
          .set({
            physicalQuantity: stock.physicalQuantity - order.quantity,
            reservedQuantity: stock.reservedQuantity - order.quantity,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          );
        await tx.insert(reservationMovements).values({
          orderId: order.id,
          referenceId: order.referenceId,
          size: order.size,
          previousReservedQuantity: stock.reservedQuantity,
          newReservedQuantity: stock.reservedQuantity - order.quantity,
          delta: -order.quantity,
          reason: 'dispatched',
          createdAt: sql`clock_timestamp()`,
        });
        await tx.insert(inventoryMovements).values({
          referenceId: order.referenceId,
          size: order.size,
          previousQuantity: stock.physicalQuantity,
          newQuantity: stock.physicalQuantity - order.quantity,
          delta: -order.quantity,
          reason: 'order_dispatched',
          note: `Order ${order.orderNumber}`,
          createdAt: sql`clock_timestamp()`,
        });
        await tx
          .update(salesOrders)
          .set({ status: next, updatedAt: sql`clock_timestamp()` })
          .where(eq(salesOrders.id, order.id));
      } else if (input.action === 'return') {
        const [stock] = await tx
          .select()
          .from(catalogStock)
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          )
          .limit(1)
          .for('update');
        if (stock === undefined)
          throw new OrderConflictError(
            'stock_missing',
            'Stock record is missing',
          );
        await tx
          .update(catalogStock)
          .set({
            physicalQuantity: stock.physicalQuantity + order.quantity,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(catalogStock.referenceId, order.referenceId),
              eq(catalogStock.size, order.size),
            ),
          );
        await tx.insert(inventoryMovements).values({
          referenceId: order.referenceId,
          size: order.size,
          previousQuantity: stock.physicalQuantity,
          newQuantity: stock.physicalQuantity + order.quantity,
          delta: order.quantity,
          reason: 'order_returned',
          note: `Order ${order.orderNumber}`,
          createdAt: sql`clock_timestamp()`,
        });
        await tx
          .update(salesOrders)
          .set({ status: next, updatedAt: sql`clock_timestamp()` })
          .where(eq(salesOrders.id, order.id));
      } else {
        await tx
          .update(salesOrders)
          .set({ status: next, updatedAt: sql`clock_timestamp()` })
          .where(eq(salesOrders.id, order.id));
      }
      await tx.insert(orderStatusEvents).values({
        orderId: order.id,
        previousStatus: order.status,
        nextStatus: next,
        ...(input.adminUserId === undefined
          ? {}
          : { adminUserId: input.adminUserId }),
        createdAt: sql`clock_timestamp()`,
      });
      const updated = await this.lockOrder(tx, order.id);
      return this.requireMapped(updated, tx);
    });
  }

  private async releaseReservation(
    tx: OrderTransaction,
    order: Row,
    reason: 'cancelled',
  ): Promise<void> {
    const [stock] = await tx
      .select()
      .from(catalogStock)
      .where(
        and(
          eq(catalogStock.referenceId, order.referenceId),
          eq(catalogStock.size, order.size),
        ),
      )
      .limit(1)
      .for('update');
    if (stock === undefined || stock.reservedQuantity < order.quantity)
      throw new OrderConflictError(
        'reservation_missing',
        'The order reservation is unavailable',
      );
    await tx
      .update(catalogStock)
      .set({
        reservedQuantity: stock.reservedQuantity - order.quantity,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(catalogStock.referenceId, order.referenceId),
          eq(catalogStock.size, order.size),
        ),
      );
    await tx.insert(reservationMovements).values({
      orderId: order.id,
      referenceId: order.referenceId,
      size: order.size,
      previousReservedQuantity: stock.reservedQuantity,
      newReservedQuantity: stock.reservedQuantity - order.quantity,
      delta: -order.quantity,
      reason,
      createdAt: sql`clock_timestamp()`,
    });
  }
  private async lockOrder(tx: OrderTransaction, orderId: string): Promise<Row> {
    const [order] = await tx
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.id, orderId))
      .limit(1)
      .for('update');
    if (order === undefined) throw new OrderNotFoundError();
    return order;
  }
  private async reference(
    referenceId: string,
    tx = this.database.orm,
  ): Promise<ReferenceRow> {
    const [reference] = await tx
      .select()
      .from(catalogReferences)
      .where(eq(catalogReferences.id, referenceId))
      .limit(1);
    if (reference === undefined)
      throw new OrderNotFoundError('Catalog reference was not found');
    return reference;
  }
  private async requireMapped(
    row: Row,
    tx = this.database.orm,
  ): Promise<OrderRecord> {
    return mapOrder(row, await this.reference(row.referenceId, tx));
  }
  private async findLocality(
    carrierCode: string | null | undefined,
  ): Promise<typeof shippingLocalities.$inferSelect | null | undefined> {
    if (carrierCode === undefined) return undefined;
    if (carrierCode === null || carrierCode.trim() === '') return null;
    const [locality] = await this.database.orm
      .select()
      .from(shippingLocalities)
      .where(eq(shippingLocalities.carrierCode, carrierCode.trim()))
      .limit(1);
    if (locality === undefined)
      throw new OrderValidationError(
        'localityCarrierCode',
        'unknown_locality',
        'The locality is not available',
      );
    return locality;
  }
}
