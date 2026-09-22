import { describe, expect, it } from 'vitest';

import { AuthService } from '../src/modules/auth/auth-service.js';
import type {
  AdminAuthRepository,
  AdminMfaRecoveryCodeRecord,
  AdminMfaSecretRecord,
  AdminSessionRecord,
  AdminUserRecord,
  SessionWithUser,
} from '../src/modules/auth/admin-auth-repository.js';
import {
  AuthenticationRequiredError,
  InvalidCredentialsError,
  PasswordMismatchError,
  UsernameConflictError,
  UserNotFoundError,
} from '../src/modules/auth/auth-errors.js';
import { hashSessionToken } from '../src/modules/auth/session-token.js';

class MemoryAdminAuthRepository implements AdminAuthRepository {
  users = new Map<string, AdminUserRecord>();
  sessions = new Map<string, AdminSessionRecord>();
  mfaSecrets = new Map<string, AdminMfaSecretRecord>();
  recoveryCodes = new Map<string, AdminMfaRecoveryCodeRecord>();

  async findUserByUsername(username: string): Promise<AdminUserRecord | null> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<AdminUserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
    role?: 'owner' | 'operator';
  }): Promise<AdminUserRecord> {
    if ((await this.findUserByUsername(input.username)) !== null) {
      throw new UsernameConflictError('Username already exists');
    }
    const now = new Date('2026-09-06T12:00:00.000Z');
    const user: AdminUserRecord = {
      id: crypto.randomUUID(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? 'owner',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async listUsers(): Promise<AdminUserRecord[]> {
    return [...this.users.values()].sort((a, b) =>
      a.username.localeCompare(b.username),
    );
  }

  async updateUserRole(input: {
    userId: string;
    role: 'owner' | 'operator';
    updatedAt: Date;
  }): Promise<AdminUserRecord> {
    const user = this.users.get(input.userId);
    if (user === undefined) {
      throw new UserNotFoundError('User was not found');
    }
    const updated = { ...user, role: input.role, updatedAt: input.updatedAt };
    this.users.set(input.userId, updated);
    return updated;
  }

  async setUserActive(input: {
    userId: string;
    active: boolean;
    updatedAt: Date;
  }): Promise<AdminUserRecord> {
    const user = this.users.get(input.userId);
    if (user === undefined) {
      throw new UserNotFoundError('User was not found');
    }
    const updated = {
      ...user,
      active: input.active,
      updatedAt: input.updatedAt,
    };
    this.users.set(input.userId, updated);
    return updated;
  }

  async revokeAllSessionsForUser(
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt });
      }
    }
  }

  async revokeOtherSessionsForUser(
    userId: string,
    keepSessionId: string,
    revokedAt: Date,
  ): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (
        session.userId === userId &&
        session.id !== keepSessionId &&
        session.revokedAt === null
      ) {
        this.sessions.set(id, { ...session, revokedAt });
      }
    }
  }

  async listActiveSessionsForUser(
    userId: string,
    now: Date,
  ): Promise<AdminSessionRecord[]> {
    return [...this.sessions.values()]
      .filter(
        (session) =>
          session.userId === userId &&
          session.revokedAt === null &&
          session.expiresAt.getTime() > now.getTime(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async touchSessionLastSeen(
    sessionId: string,
    lastSeenAt: Date,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      this.sessions.set(sessionId, { ...session, lastSeenAt });
    }
  }

  async updatePasswordAndRevokeSessions(input: {
    userId: string;
    passwordHash: string;
    revokedAt: Date;
  }): Promise<void> {
    const user = this.users.get(input.userId);
    if (user === undefined) {
      throw new UserNotFoundError('User was not found');
    }
    this.users.set(input.userId, {
      ...user,
      passwordHash: input.passwordHash,
      updatedAt: input.revokedAt,
    });
    for (const [id, session] of this.sessions) {
      if (session.userId === input.userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt: input.revokedAt });
      }
    }
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
    lastSeenAt: Date;
  }): Promise<AdminSessionRecord> {
    const session: AdminSessionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      lastSeenAt: input.lastSeenAt,
      revokedAt: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findValidSessionByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionWithUser | null> {
    for (const session of this.sessions.values()) {
      if (
        session.tokenHash === tokenHash &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > now.getTime()
      ) {
        const user = this.users.get(session.userId);
        if (user === undefined) {
          return null;
        }
        return { session, user };
      }
    }
    return null;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.revokedAt !== null) {
      return;
    }
    this.sessions.set(sessionId, { ...session, revokedAt });
  }

  async purgeExpiredSessions(now: Date): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt.getTime() <= now.getTime()) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async findMfaSecretByUserId(
    userId: string,
  ): Promise<AdminMfaSecretRecord | null> {
    return this.mfaSecrets.get(userId) ?? null;
  }

  async upsertMfaSecret(input: {
    userId: string;
    encryptedSecret: string;
    enabled: boolean;
    createdAt: Date;
  }): Promise<AdminMfaSecretRecord> {
    const record: AdminMfaSecretRecord = {
      userId: input.userId,
      encryptedSecret: input.encryptedSecret,
      enabled: input.enabled,
      createdAt: input.createdAt,
    };
    this.mfaSecrets.set(input.userId, record);
    return record;
  }

  async setMfaEnabled(userId: string, enabled: boolean): Promise<void> {
    const current = this.mfaSecrets.get(userId);
    if (current !== undefined) {
      this.mfaSecrets.set(userId, { ...current, enabled });
    }
  }

  async deleteMfaForUser(userId: string): Promise<void> {
    this.mfaSecrets.delete(userId);
    for (const [id, code] of this.recoveryCodes) {
      if (code.userId === userId) {
        this.recoveryCodes.delete(id);
      }
    }
  }

  async replaceMfaRecoveryCodes(input: {
    userId: string;
    codeHashes: readonly string[];
    createdAt: Date;
  }): Promise<void> {
    for (const [id, code] of this.recoveryCodes) {
      if (code.userId === input.userId) {
        this.recoveryCodes.delete(id);
      }
    }
    for (const codeHash of input.codeHashes) {
      const id = crypto.randomUUID();
      this.recoveryCodes.set(id, {
        id,
        userId: input.userId,
        codeHash,
        usedAt: null,
        createdAt: input.createdAt,
      });
    }
  }

  async findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<AdminMfaRecoveryCodeRecord | null> {
    for (const code of this.recoveryCodes.values()) {
      if (
        code.userId === userId &&
        code.codeHash === codeHash &&
        code.usedAt === null
      ) {
        return code;
      }
    }
    return null;
  }

  async markRecoveryCodeUsed(id: string, usedAt: Date): Promise<void> {
    const code = this.recoveryCodes.get(id);
    if (code !== undefined) {
      this.recoveryCodes.set(id, { ...code, usedAt });
    }
  }
}

describe('AuthService', () => {
  it('creates a user storing only the password hash', async () => {
    const repository = new MemoryAdminAuthRepository();
    const service = new AuthService(repository);
    const user = await service.createUser(
      '  Camila  ',
      'password1234',
      'password1234',
    );

    expect(user).toEqual({ id: user.id, username: 'camila', role: 'owner' });
    const stored = [...repository.users.values()][0];
    expect(stored?.passwordHash).not.toContain('password1234');
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('rejects mismatched password confirmation and duplicate usernames', async () => {
    const repository = new MemoryAdminAuthRepository();
    const service = new AuthService(repository);

    await expect(
      service.createUser('camila', 'password1234', 'password9999'),
    ).rejects.toBeInstanceOf(PasswordMismatchError);

    await service.createUser('camila', 'password1234', 'password1234');
    await expect(
      service.createUser('camila', 'password1234', 'password1234'),
    ).rejects.toBeInstanceOf(UsernameConflictError);
  });

  it('logs in with valid credentials and persists only the token hash', async () => {
    const repository = new MemoryAdminAuthRepository();
    const now = new Date('2026-09-06T12:00:00.000Z');
    const service = new AuthService(repository, {
      now: () => now,
      createToken: () => 'fixed-session-token-value-32b!!!!',
    });

    await service.createUser('camila', 'password1234', 'password1234');
    const result = await service.login('Camila', 'password1234');
    expect(result.kind).toBe('session');
    if (result.kind !== 'session') {
      throw new Error('expected session login');
    }

    expect(result.user.username).toBe('camila');
    expect(result.token).toBe('fixed-session-token-value-32b!!!!');
    expect(result.expiresAt.toISOString()).toBe('2026-09-07T00:00:00.000Z');

    const session = [...repository.sessions.values()][0];
    expect(session?.tokenHash).toBe(
      hashSessionToken('fixed-session-token-value-32b!!!!'),
    );
    expect(session?.tokenHash).not.toBe(result.token);
  });

  it('rejects missing users, bad passwords, and inactive accounts the same way', async () => {
    const repository = new MemoryAdminAuthRepository();
    const service = new AuthService(repository);
    await service.createUser('camila', 'password1234', 'password1234');

    const stored = [...repository.users.values()][0]!;
    repository.users.set(stored.id, { ...stored, active: false });

    await expect(
      service.login('missing', 'password1234'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login('camila', 'wrong-password'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login('camila', 'password1234'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('returns the session user and rejects revoked or expired sessions', async () => {
    const repository = new MemoryAdminAuthRepository();
    let now = new Date('2026-09-06T12:00:00.000Z');
    const service = new AuthService(repository, {
      now: () => now,
      createToken: () => 'session-token-aaaaaaaaaaaaaaaaaaa',
    });

    await service.createUser('camila', 'password1234', 'password1234');
    const loginResult = await service.login('camila', 'password1234');
    if (loginResult.kind !== 'session') {
      throw new Error('expected session login');
    }
    const { token } = loginResult;
    await expect(service.getSession(token)).resolves.toEqual({
      id: expect.any(String),
      username: 'camila',
      role: 'owner',
    });

    await service.logout(token);
    await expect(service.getSession(token)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );

    const second = new AuthService(repository, {
      now: () => now,
      createToken: () => 'session-token-bbbbbbbbbbbbbbbbbbb',
    });
    const loginAttempt = await second.login('camila', 'password1234');
    if (loginAttempt.kind !== 'session') {
      throw new Error('expected session login');
    }
    const login = loginAttempt;
    now = new Date('2026-09-07T12:01:00.000Z');
    await expect(second.getSession(login.token)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it('resets password and revokes open sessions in one operation', async () => {
    const repository = new MemoryAdminAuthRepository();
    const service = new AuthService(repository, {
      createToken: () => 'session-token-ccccccccccccccccccc',
    });

    await service.createUser('camila', 'password1234', 'password1234');
    const loginResult = await service.login('camila', 'password1234');
    if (loginResult.kind !== 'session') {
      throw new Error('expected session login');
    }
    const { token } = loginResult;

    await service.resetPassword('camila', 'new-password-99', 'new-password-99');

    const stored = [...repository.users.values()][0]!;
    expect(stored.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(stored.passwordHash).not.toContain('new-password-99');

    await expect(service.getSession(token)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    await expect(
      service.login('camila', 'password1234'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login('camila', 'new-password-99'),
    ).resolves.toMatchObject({ user: { username: 'camila' } });

    await expect(
      service.resetPassword('missing', 'new-password-99', 'new-password-99'),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
