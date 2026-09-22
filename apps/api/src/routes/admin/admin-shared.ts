import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config.js';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
} from '../../http/session-cookie.js';
import type { AdminUserPublic } from '../../modules/auth/admin-auth-repository.js';
import type { AuthService } from '../../modules/auth/auth-service.js';

export const ReferenceIdParamsSchema = z
  .object({
    referenceId: z.uuid(),
  })
  .strict();

export const StockParamsSchema = z
  .object({
    referenceId: z.uuid(),
    size: z.string().min(1),
  })
  .strict();

export const OrderIdParamsSchema = z.object({ orderId: z.uuid() }).strict();

export function toPublicClosure(value: unknown) {
  const row = value as {
    id: string;
    businessDate: string;
    version: number;
    profile: string;
    status: string;
    movementCount: number;
    totalUnits: number;
    checksum: string;
    createdAt: Date;
    acknowledgedAt: Date | null;
  };
  return {
    id: row.id,
    businessDate: row.businessDate,
    version: row.version,
    profile: row.profile,
    status: row.status,
    movementCount: row.movementCount,
    totalUnits: row.totalUnits,
    checksum: row.checksum,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}

export function encodeConversationCursor(cursor: {
  updatedAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeConversationCursor(cursor: string): {
  updatedAt: Date;
  id: string;
} {
  const parsed = z
    .object({ updatedAt: z.string().datetime(), id: z.uuid() })
    .strict()
    .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  return { updatedAt: new Date(parsed.updatedAt), id: parsed.id };
}

export async function requireAdminSession(
  request: FastifyRequest,
  authService: AuthService,
): Promise<AdminUserPublic> {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const user = await authService.getSession(token);
  request.adminUser = user;
  return user;
}

export function clearSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
): void {
  reply.clearCookie(
    ADMIN_SESSION_COOKIE,
    adminSessionCookieOptions(config.nodeEnv),
  );
}

export type AdminAuthenticate = (
  request: FastifyRequest,
) => Promise<AdminUserPublic>;
