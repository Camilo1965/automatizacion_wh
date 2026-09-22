import type { AuthAuditEvent, AuthAuditSink } from '../auth/auth-audit-sink.js';
import {
  sanitizeAuditMetadata,
  type AuditListQuery,
  type AuditListResult,
  type AuditRecord,
  type AuditRecordInput,
} from './audit-event.js';
import type { AuditRepository } from './audit-repository.js';

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(input: AuditRecordInput): Promise<AuditRecord> {
    return this.repository.append({
      ...input,
      metadata: sanitizeAuditMetadata(input.metadata),
    });
  }

  async list(query: AuditListQuery = {}): Promise<AuditListResult> {
    return this.repository.list(query);
  }

  /** Adapter so AuthService writes into the unified append-only store. */
  asAuthAuditSink(): AuthAuditSink {
    return {
      record: async (event: AuthAuditEvent) => {
        await this.record({
          action: event.action,
          result: event.result,
          actorUserId: event.actorUserId ?? null,
          actorUsername: event.actorUsername ?? null,
          targetType: event.targetType ?? null,
          targetId: event.targetId ?? null,
          at: event.at,
          ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
        });
      },
    };
  }
}
