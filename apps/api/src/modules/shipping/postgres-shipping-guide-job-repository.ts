import { eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { shippingGuideJobs } from '../../database/schema/index.js';
import { assertGuideJobTransition } from './guide-job-state.js';

export type ClaimedShippingGuideJob = Readonly<{
  id: string;
  orderId: string;
  carrier: string;
  insuranceMode: 'none' | 'standard' | 'plus';
  collectionValueCop: number;
  status: 'processing';
  packageDefaults?: {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
}>;

export type ShippingGuideUncertainResult = Readonly<{
  status:
    'pending' | 'processing' | 'created' | 'uncertain' | 'failed' | 'missing';
  preShipmentNumber: string | null;
}>;

export class PostgresShippingGuideJobRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async enqueue(orderId: string): Promise<Readonly<{ id: string }>> {
    const [inserted] = await this.database.orm
      .insert(shippingGuideJobs)
      .values({ orderId })
      .onConflictDoNothing({ target: shippingGuideJobs.orderId })
      .returning({ id: shippingGuideJobs.id });
    if (inserted !== undefined) return inserted;
    const [existing] = await this.database.orm
      .select({ id: shippingGuideJobs.id })
      .from(shippingGuideJobs)
      .where(eq(shippingGuideJobs.orderId, orderId))
      .limit(1);
    if (existing === undefined)
      throw new Error('Shipping guide job enqueue failed');
    return existing;
  }

  async claimNext(): Promise<ClaimedShippingGuideJob | null> {
    const result = await this.database.orm.execute(sql`
      WITH candidate AS (
        SELECT job.id,
          COALESCE(job.confirmed_total_cop, reference.price_cop * orders.quantity
            + COALESCE(quote.freight_cop, 0)
            + COALESCE(quote.cash_on_delivery_cop, 0)
            + COALESCE(quote.surcharge_cop, 0)
            + COALESCE(quote.insurance_cop, 0)) AS collection_value_cop
        FROM shipping_guide_jobs AS job
        JOIN sales_orders AS orders ON orders.id = job.order_id
        JOIN catalog_references AS reference ON reference.id = orders.reference_id
        LEFT JOIN shipping_quotes AS quote ON quote.id = job.quote_id
        WHERE job.status = 'pending'
          AND orders.status = 'confirmed'
        ORDER BY job.created_at, job.id
        FOR UPDATE OF job SKIP LOCKED
        LIMIT 1
      )
      UPDATE shipping_guide_jobs AS job
      SET status = 'processing', updated_at = clock_timestamp()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.order_id, job.carrier, job.insurance_mode, job.policy_snapshot, candidate.collection_value_cop
    `);
    const rows = result as unknown as Array<{
      id: string;
      order_id: string;
      carrier: string;
      insurance_mode: 'none' | 'standard' | 'plus';
      collection_value_cop: number;
      policy_snapshot: {
        packageDefaults?: {
          weightKg: number;
          lengthCm: number;
          widthCm: number;
          heightCm: number;
          contents?: string;
        };
      } | null;
    }>;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          orderId: row.order_id,
          carrier: row.carrier,
          insuranceMode: row.insurance_mode,
          collectionValueCop: row.collection_value_cop,
          status: 'processing',
          ...(row.policy_snapshot?.packageDefaults
            ? { packageDefaults: row.policy_snapshot.packageDefaults }
            : {}),
        };
  }

  async markUncertain(
    id: string,
    preShipmentNumber: string | null,
  ): Promise<ShippingGuideUncertainResult> {
    assertGuideJobTransition('processing', 'mark_uncertain');
    const [updated] = await this.database.orm
      .update(shippingGuideJobs)
      .set({
        status: 'uncertain',
        preShipmentNumber,
        errorCode: 'uncertain',
        updatedAt: new Date(),
      })
      .where(
        sql`${shippingGuideJobs.id} = ${id} AND ${shippingGuideJobs.status} = 'processing'`,
      )
      .returning({
        status: shippingGuideJobs.status,
        preShipmentNumber: shippingGuideJobs.preShipmentNumber,
      });
    if (updated !== undefined) {
      return {
        status: updated.status as ShippingGuideUncertainResult['status'],
        preShipmentNumber: updated.preShipmentNumber,
      };
    }

    const [current] = await this.database.orm
      .select({
        status: shippingGuideJobs.status,
        preShipmentNumber: shippingGuideJobs.preShipmentNumber,
      })
      .from(shippingGuideJobs)
      .where(eq(shippingGuideJobs.id, id))
      .limit(1);
    return current === undefined
      ? { status: 'missing', preShipmentNumber: null }
      : {
          status: current.status as ShippingGuideUncertainResult['status'],
          preShipmentNumber: current.preShipmentNumber,
        };
  }

  async markCreated(
    id: string,
    preShipmentNumber: string,
    freightCop: number,
  ): Promise<void> {
    assertGuideJobTransition('processing', 'mark_created');
    await this.database.orm.transaction(async (tx) => {
      const [updated] = await tx
        .update(shippingGuideJobs)
        .set({
          status: 'created',
          preShipmentNumber,
          freightCop,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(
          sql`${shippingGuideJobs.id} = ${id} AND ${shippingGuideJobs.status} = 'processing'`,
        )
        .returning({ id: shippingGuideJobs.id });
      if (updated === undefined) return;
      await tx.execute(sql`
        INSERT INTO whatsapp_conversation_messages
          (conversation_id, source, message_type, status, occurred_at,
           guide_job_id, guide_order_id)
        SELECT link.origin_conversation_id, 'system', 'event', 'internal',
          job.updated_at, job.id, job.order_id
        FROM shipping_guide_jobs job
        JOIN conversation_order_links link ON link.order_id = job.order_id
        WHERE job.id = ${id}
        ON CONFLICT (guide_job_id) DO NOTHING
      `);
    });
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    assertGuideJobTransition('processing', 'mark_failed');
    await this.database.orm
      .update(shippingGuideJobs)
      .set({
        status: 'failed',
        errorCode: errorCode.slice(0, 64),
        updatedAt: new Date(),
      })
      .where(eq(shippingGuideJobs.id, id));
  }

  async findByOrderId(orderId: string) {
    const [job] = await this.database.orm
      .select()
      .from(shippingGuideJobs)
      .where(eq(shippingGuideJobs.orderId, orderId))
      .limit(1);
    return job ?? null;
  }

  async attachPdf(
    id: string,
    pdf: Readonly<{ storageKey: string; sha256: string; byteSize: number }>,
  ): Promise<boolean> {
    const [updated] = await this.database.orm
      .update(shippingGuideJobs)
      .set({
        guidePdfStorageKey: pdf.storageKey,
        guidePdfSha256: pdf.sha256,
        guidePdfByteSize: pdf.byteSize,
        guidePdfFetchedAt: new Date(),
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(
        sql`${shippingGuideJobs.id} = ${id}
          AND ${shippingGuideJobs.status} = 'created'
          AND ${shippingGuideJobs.guidePdfStorageKey} IS NULL`,
      )
      .returning({ id: shippingGuideJobs.id });
    return updated !== undefined;
  }

  async reviewUncertain(
    id: string,
    preShipmentNumber: string,
  ): Promise<boolean> {
    assertGuideJobTransition('uncertain', 'resolve_uncertain');
    return this.database.orm.transaction(async (tx) => {
      const [updated] = await tx
        .update(shippingGuideJobs)
        .set({
          status: 'created',
          preShipmentNumber,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(
          sql`${shippingGuideJobs.id} = ${id} AND ${shippingGuideJobs.status} = 'uncertain'`,
        )
        .returning({ id: shippingGuideJobs.id });
      if (updated === undefined) return false;
      await tx.execute(sql`
        INSERT INTO whatsapp_conversation_messages
          (conversation_id, source, message_type, status, occurred_at,
           guide_job_id, guide_order_id)
        SELECT link.origin_conversation_id, 'system', 'event', 'internal',
          job.updated_at, job.id, job.order_id
        FROM shipping_guide_jobs job
        JOIN conversation_order_links link ON link.order_id = job.order_id
        WHERE job.id = ${id}
        ON CONFLICT (guide_job_id) DO NOTHING
      `);
      return true;
    });
  }
}
