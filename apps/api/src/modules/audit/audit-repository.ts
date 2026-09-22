import type {
  AuditListQuery,
  AuditListResult,
  AuditRecord,
  AuditRecordInput,
} from './audit-event.js';

/**
 * Append-only audit persistence. Consumers must not update or delete rows.
 * Deliberately exposes no update/delete methods.
 */
export interface AuditRepository {
  append(
    input: AuditRecordInput & { metadata: Record<string, unknown> },
  ): Promise<AuditRecord>;
  list(query: AuditListQuery): Promise<AuditListResult>;
}
