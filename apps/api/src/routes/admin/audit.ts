import type { FastifyInstance } from 'fastify';
import { AuditListQuerySchema } from '@camila/contracts';

import type { AuditRecord } from '../../modules/audit/audit-event.js';
import type { AuditService } from '../../modules/audit/audit-service.js';
import { authorize, type AdminAuthenticate } from './admin-shared.js';

export function toPublicAuditEvent(row: AuditRecord) {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorUsername: row.actorUsername,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    correlationId: row.correlationId,
    metadata: row.metadata,
    result: row.result,
    ipHash: row.ipHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    auditService: AuditService;
  },
): Promise<void> {
  const requireAudit = authorize(dependencies.authenticate, 'audit:read');

  app.get('/audit', async (request) => {
    await requireAudit(request);
    const query = AuditListQuerySchema.parse(request.query);
    const result = await dependencies.auditService.list({
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.offset === undefined ? {} : { offset: query.offset }),
      ...(query.actorUserId === undefined
        ? {}
        : { actorUserId: query.actorUserId }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.targetType === undefined
        ? {}
        : { targetType: query.targetType }),
      ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
      ...(query.result === undefined ? {} : { result: query.result }),
      ...(query.from === undefined ? {} : { from: new Date(query.from) }),
      ...(query.to === undefined ? {} : { to: new Date(query.to) }),
    });
    return {
      data: {
        items: result.items.map(toPublicAuditEvent),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  });

  /** Backward-compatible Historial path. */
  app.get('/configuration/audit', async (request) => {
    await requireAudit(request);
    const query = AuditListQuerySchema.parse(request.query);
    const result = await dependencies.auditService.list({
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.offset === undefined ? {} : { offset: query.offset }),
      ...(query.actorUserId === undefined
        ? {}
        : { actorUserId: query.actorUserId }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.targetType === undefined
        ? {}
        : { targetType: query.targetType }),
      ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
      ...(query.result === undefined ? {} : { result: query.result }),
      ...(query.from === undefined ? {} : { from: new Date(query.from) }),
      ...(query.to === undefined ? {} : { to: new Date(query.to) }),
    });
    return {
      data: {
        items: result.items.map(toPublicAuditEvent),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  });
}
