import { desc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  ownerAlerts,
  ownerAlertDeliveries,
} from '../../database/schema/index.js';
import type { AlertInput, AlertRepository } from './alert-service.js';

function publicAlert(row: typeof ownerAlerts.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    entityUrl: row.entityUrl,
    status: row.status,
    attempts: row.attempts,
    retrySafe: row.retrySafe,
    createdAt: row.createdAt,
    readAt: row.readAt,
    resolvedAt: row.resolvedAt,
  };
}

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
  async list() {
    const rows = await this.database.orm
      .select({
        alert: ownerAlerts,
        notificationStatus: ownerAlertDeliveries.status,
      })
      .from(ownerAlerts)
      .leftJoin(
        ownerAlertDeliveries,
        eq(ownerAlertDeliveries.alertId, ownerAlerts.id),
      )
      .orderBy(desc(ownerAlerts.createdAt))
      .limit(100);
    return rows.map((row) => ({
      ...publicAlert(row.alert),
      notificationStatus: row.notificationStatus,
    }));
  }
  async markRead(id: string) {
    const [row] = await this.database.orm
      .update(ownerAlerts)
      .set({ status: 'read', readAt: sql`clock_timestamp()` })
      .where(eq(ownerAlerts.id, id))
      .returning();
    return row ? publicAlert(row) : undefined;
  }
  async resolve(id: string) {
    const [row] = await this.database.orm
      .update(ownerAlerts)
      .set({ status: 'resolved', resolvedAt: sql`clock_timestamp()` })
      .where(eq(ownerAlerts.id, id))
      .returning();
    return row ? publicAlert(row) : undefined;
  }
}
