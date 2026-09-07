import { eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { shippingGuideJobs } from '../../database/schema.js';

export type ClaimedShippingGuideJob = Readonly<{
  id: string;
  orderId: string;
  carrier: string;
  status: 'processing';
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
        SELECT id FROM shipping_guide_jobs
        WHERE status = 'pending'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE shipping_guide_jobs AS job
      SET status = 'processing', updated_at = clock_timestamp()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.order_id, job.carrier
    `);
    const rows = result as unknown as Array<{
      id: string;
      order_id: string;
      carrier: string;
    }>;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          orderId: row.order_id,
          carrier: row.carrier,
          status: 'processing',
        };
  }

  async markUncertain(id: string): Promise<void> {
    await this.database.orm
      .update(shippingGuideJobs)
      .set({
        status: 'uncertain',
        errorCode: 'uncertain',
        updatedAt: new Date(),
      })
      .where(eq(shippingGuideJobs.id, id));
  }

  async markCreated(
    id: string,
    preShipmentNumber: string,
    freightCop: number,
  ): Promise<void> {
    await this.database.orm
      .update(shippingGuideJobs)
      .set({
        status: 'created',
        preShipmentNumber,
        freightCop,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(shippingGuideJobs.id, id));
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    await this.database.orm
      .update(shippingGuideJobs)
      .set({
        status: 'failed',
        errorCode: errorCode.slice(0, 64),
        updatedAt: new Date(),
      })
      .where(eq(shippingGuideJobs.id, id));
  }
}
