import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  adminMfaRecoveryCodes,
  adminMfaSecrets,
  adminSessions,
  adminUsers,
} from '../../database/schema/index.js';
import type {
  AdminAuthRepository,
  AdminMfaRecoveryCodeRecord,
  AdminMfaSecretRecord,
  AdminRole,
  AdminSessionRecord,
  AdminUserRecord,
  SessionWithUser,
} from './admin-auth-repository.js';
import { UsernameConflictError, UserNotFoundError } from './auth-errors.js';

type UserRow = typeof adminUsers.$inferSelect;
type SessionRow = typeof adminSessions.$inferSelect;

function mapRole(role: string): AdminRole {
  if (role === 'owner' || role === 'operator') {
    return role;
  }
  return 'owner';
}

function mapUser(row: UserRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: mapRole(row.role),
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

  async listUsers(): Promise<AdminUserRecord[]> {
    const rows = await this.database.orm
      .select()
      .from(adminUsers)
      .orderBy(asc(adminUsers.username));
    return rows.map(mapUser);
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
    role?: AdminRole;
  }): Promise<AdminUserRecord> {
    try {
      const rows = await this.database.orm
        .insert(adminUsers)
        .values({
          username: input.username,
          passwordHash: input.passwordHash,
          role: input.role ?? 'owner',
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

  async updateUserRole(input: {
    userId: string;
    role: AdminRole;
    updatedAt: Date;
  }): Promise<AdminUserRecord> {
    const rows = await this.database.orm
      .update(adminUsers)
      .set({
        role: input.role,
        updatedAt: input.updatedAt,
      })
      .where(eq(adminUsers.id, input.userId))
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new UserNotFoundError('User was not found');
    }
    return mapUser(row);
  }

  async setUserActive(input: {
    userId: string;
    active: boolean;
    updatedAt: Date;
  }): Promise<AdminUserRecord> {
    const rows = await this.database.orm
      .update(adminUsers)
      .set({
        active: input.active,
        updatedAt: input.updatedAt,
      })
      .where(eq(adminUsers.id, input.userId))
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new UserNotFoundError('User was not found');
    }
    return mapUser(row);
  }

  async revokeAllSessionsForUser(
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.database.orm
      .update(adminSessions)
      .set({ revokedAt })
      .where(
        and(eq(adminSessions.userId, userId), isNull(adminSessions.revokedAt)),
      );
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

  async purgeExpiredSessions(now: Date): Promise<number> {
    const removed = await this.database.orm
      .delete(adminSessions)
      .where(lte(adminSessions.expiresAt, now))
      .returning({ id: adminSessions.id });
    return removed.length;
  }

  async findMfaSecretByUserId(
    userId: string,
  ): Promise<AdminMfaSecretRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(adminMfaSecrets)
      .where(eq(adminMfaSecrets.userId, userId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      userId: row.userId,
      encryptedSecret: row.encryptedSecret,
      enabled: row.enabled,
      createdAt: row.createdAt,
    };
  }

  async upsertMfaSecret(input: {
    userId: string;
    encryptedSecret: string;
    enabled: boolean;
    createdAt: Date;
  }): Promise<AdminMfaSecretRecord> {
    const rows = await this.database.orm
      .insert(adminMfaSecrets)
      .values({
        userId: input.userId,
        encryptedSecret: input.encryptedSecret,
        enabled: input.enabled,
        createdAt: input.createdAt,
      })
      .onConflictDoUpdate({
        target: adminMfaSecrets.userId,
        set: {
          encryptedSecret: input.encryptedSecret,
          enabled: input.enabled,
        },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Failed to upsert MFA secret');
    }
    return {
      userId: row.userId,
      encryptedSecret: row.encryptedSecret,
      enabled: row.enabled,
      createdAt: row.createdAt,
    };
  }

  async setMfaEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.database.orm
      .update(adminMfaSecrets)
      .set({ enabled })
      .where(eq(adminMfaSecrets.userId, userId));
  }

  async deleteMfaForUser(userId: string): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx
        .delete(adminMfaRecoveryCodes)
        .where(eq(adminMfaRecoveryCodes.userId, userId));
      await tx
        .delete(adminMfaSecrets)
        .where(eq(adminMfaSecrets.userId, userId));
    });
  }

  async replaceMfaRecoveryCodes(input: {
    userId: string;
    codeHashes: readonly string[];
    createdAt: Date;
  }): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx
        .delete(adminMfaRecoveryCodes)
        .where(eq(adminMfaRecoveryCodes.userId, input.userId));
      if (input.codeHashes.length === 0) {
        return;
      }
      await tx.insert(adminMfaRecoveryCodes).values(
        input.codeHashes.map((codeHash) => ({
          userId: input.userId,
          codeHash,
          createdAt: input.createdAt,
        })),
      );
    });
  }

  async findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<AdminMfaRecoveryCodeRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(adminMfaRecoveryCodes)
      .where(
        and(
          eq(adminMfaRecoveryCodes.userId, userId),
          eq(adminMfaRecoveryCodes.codeHash, codeHash),
          isNull(adminMfaRecoveryCodes.usedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      codeHash: row.codeHash,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }

  async markRecoveryCodeUsed(id: string, usedAt: Date): Promise<void> {
    await this.database.orm
      .update(adminMfaRecoveryCodes)
      .set({ usedAt })
      .where(eq(adminMfaRecoveryCodes.id, id));
  }
}
