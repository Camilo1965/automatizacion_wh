import { randomUUID } from 'node:crypto';

import type {
  AuditListQuery,
  AuditListResult,
  AuditRecord,
  AuditRecordInput,
  AuditMetadata,
} from './audit-event.js';
import type { AuditRepository } from './audit-repository.js';

export class InMemoryAuditRepository implements AuditRepository {
  private readonly rows: AuditRecord[] = [];

  async append(
    input: AuditRecordInput & { metadata: Record<string, unknown> },
  ): Promise<AuditRecord> {
    const record: AuditRecord = {
      id: randomUUID(),
      actorUserId: input.actorUserId ?? null,
      actorUsername: input.actorUsername ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata as AuditMetadata,
      result: input.result,
      ipHash: input.ipHash ?? null,
      createdAt: input.at ?? new Date(),
    };
    this.rows.push(record);
    return record;
  }

  async list(query: AuditListQuery): Promise<AuditListResult> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    let filtered = [...this.rows];
    if (query.actorUserId !== undefined) {
      filtered = filtered.filter((row) => row.actorUserId === query.actorUserId);
    }
    if (query.action !== undefined) {
      filtered = filtered.filter((row) => row.action === query.action);
    }
    if (query.targetType !== undefined) {
      filtered = filtered.filter((row) => row.targetType === query.targetType);
    }
    if (query.targetId !== undefined) {
      filtered = filtered.filter((row) => row.targetId === query.targetId);
    }
    if (query.result !== undefined) {
      filtered = filtered.filter((row) => row.result === query.result);
    }
    if (query.from !== undefined) {
      const from = query.from;
      filtered = filtered.filter((row) => row.createdAt >= from);
    }
    if (query.to !== undefined) {
      const to = query.to;
      filtered = filtered.filter((row) => row.createdAt <= to);
    }
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = filtered.length;
    return {
      items: filtered.slice(offset, offset + limit),
      total,
      limit,
      offset,
    };
  }

  events(): readonly AuditRecord[] {
    return this.rows;
  }

  clear(): void {
    this.rows.length = 0;
  }
}
