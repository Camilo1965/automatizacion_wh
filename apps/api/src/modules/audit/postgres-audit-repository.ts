import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { adminAuditEvents } from '../../database/schema/admin.js';
import type {
  AuditListQuery,
  AuditListResult,
  AuditMetadata,
  AuditRecord,
  AuditRecordInput,
  AuditResult,
} from './audit-event.js';
import type { AuditRepository } from './audit-repository.js';

function toRecord(row: typeof adminAuditEvents.$inferSelect): AuditRecord {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorUsername: row.actorUsername,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    correlationId: row.correlationId,
    metadata: (row.metadata ?? {}) as AuditMetadata,
    result: row.result as AuditResult,
    ipHash: row.ipHash,
    createdAt: row.createdAt,
  };
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async append(
    input: AuditRecordInput & { metadata: Record<string, unknown> },
  ): Promise<AuditRecord> {
    const [row] = await this.database.orm
      .insert(adminAuditEvents)
      .values({
        actorUserId: input.actorUserId ?? null,
        actorUsername: input.actorUsername ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        correlationId: input.correlationId ?? null,
        metadata: input.metadata,
        result: input.result,
        ipHash: input.ipHash ?? null,
        ...(input.at === undefined ? {} : { createdAt: input.at }),
      })
      .returning();
    if (row === undefined) {
      throw new Error('audit append returned no row');
    }
    return toRecord(row);
  }

  async list(query: AuditListQuery): Promise<AuditListResult> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const filters: SQL[] = [];
    if (query.actorUserId !== undefined) {
      filters.push(eq(adminAuditEvents.actorUserId, query.actorUserId));
    }
    if (query.action !== undefined) {
      filters.push(eq(adminAuditEvents.action, query.action));
    }
    if (query.targetType !== undefined) {
      filters.push(eq(adminAuditEvents.targetType, query.targetType));
    }
    if (query.targetId !== undefined) {
      filters.push(eq(adminAuditEvents.targetId, query.targetId));
    }
    if (query.result !== undefined) {
      filters.push(eq(adminAuditEvents.result, query.result));
    }
    if (query.from !== undefined) {
      filters.push(gte(adminAuditEvents.createdAt, query.from));
    }
    if (query.to !== undefined) {
      filters.push(lte(adminAuditEvents.createdAt, query.to));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [totalRow] = await this.database.orm
      .select({ value: count() })
      .from(adminAuditEvents)
      .where(where);

    const rows = await this.database.orm
      .select()
      .from(adminAuditEvents)
      .where(where)
      .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toRecord),
      total: Number(totalRow?.value ?? 0),
      limit,
      offset,
    };
  }
}
