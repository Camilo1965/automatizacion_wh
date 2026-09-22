import { and, eq, gt, isNull } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { adminSessions, adminUsers } from '../../database/schema/index.js';
import type {
  AdminAuthRepository,
  AdminSessionRecord,
  AdminUserRecord,
  SessionWithUser,
} from './admin-auth-repository.js';
import { UsernameConflictError, UserNotFoundError } from './auth-errors.js';

type UserRow = typeof adminUsers.$inferSelect;
type SessionRow = typeof adminSessions.$inferSelect;

function mapUser(row: UserRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSession(row: SessionRow): AdminSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && current.code === '23505') {
      return true;
    }
    if ('cause' in current) {
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

export class PostgresAdminAuthRepository implements AdminAuthRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async findUserByUsername(username: string): Promise<AdminUserRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async findUserById(id: string): Promise<AdminUserRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
  }): Promise<AdminUserRecord> {
    try {
      const rows = await this.database.orm
        .insert(adminUsers)
        .values({
          username: input.username,
          passwordHash: input.passwordHash,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error('Failed to create admin user');
      }
      return mapUser(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UsernameConflictError('Username already exists');
      }
      throw error;
    }
  }

  async updatePasswordAndRevokeSessions(input: {
    userId: string;
    passwordHash: string;
    revokedAt: Date;
  }): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      const updated = await tx
        .update(adminUsers)
        .set({
          passwordHash: input.passwordHash,
          updatedAt: input.revokedAt,
        })
        .where(eq(adminUsers.id, input.userId))
        .returning({ id: adminUsers.id });

      if (updated[0] === undefined) {
        throw new UserNotFoundError('User was not found');
      }

      await tx
        .update(adminSessions)
        .set({ revokedAt: input.revokedAt })
        .where(
          and(
            eq(adminSessions.userId, input.userId),
            isNull(adminSessions.revokedAt),
          ),
        );
    });
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<AdminSessionRecord> {
    const rows = await this.database.orm
      .insert(adminSessions)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Failed to create admin session');
    }
    return mapSession(row);
  }

  async findValidSessionByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionWithUser | null> {
    const rows = await this.database.orm
      .select({
        session: adminSessions,
        user: adminUsers,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, now),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      session: mapSession(row.session),
      user: mapUser(row.user),
    };
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.database.orm
      .update(adminSessions)
      .set({ revokedAt })
      .where(
        and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)),
      );
  }
}
