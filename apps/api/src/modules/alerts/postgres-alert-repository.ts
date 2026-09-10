import { desc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import { ownerAlerts } from '../../database/schema.js';
import type { AlertInput, AlertRepository } from './alert-service.js';

export class PostgresAlertRepository implements AlertRepository {
  constructor(private readonly database: PostgresDatabase) {}
  async open(input: AlertInput & { deduplicationKey: string }) {
    const [row] = await this.database.orm
      .insert(ownerAlerts)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [existing] = await this.database.orm
      .select()
      .from(ownerAlerts)
      .where(eq(ownerAlerts.deduplicationKey, input.deduplicationKey))
      .limit(1);
    return existing;
  }
  list() {
    return this.database.orm
      .select()
      .from(ownerAlerts)
      .orderBy(desc(ownerAlerts.createdAt))
      .limit(100);
  }
  async markRead(id: string) {
    const [row] = await this.database.orm
      .update(ownerAlerts)
      .set({ status: 'read', readAt: sql`clock_timestamp()` })
      .where(eq(ownerAlerts.id, id))
      .returning();
    return row;
  }
  async resolve(id: string) {
    const [row] = await this.database.orm
      .update(ownerAlerts)
      .set({ status: 'resolved', resolvedAt: sql`clock_timestamp()` })
      .where(eq(ownerAlerts.id, id))
      .returning();
    return row;
  }
}
