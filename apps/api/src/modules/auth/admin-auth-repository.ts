export type AdminUserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminUserPublic = {
  id: string;
  username: string;
};

export type AdminSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type SessionWithUser = {
  session: AdminSessionRecord;
  user: AdminUserRecord;
};

export type AdminMfaSecretRecord = {
  userId: string;
  encryptedSecret: string;
  enabled: boolean;
  createdAt: Date;
};

export type AdminMfaRecoveryCodeRecord = {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
};

export interface AdminAuthRepository {
  findUserByUsername(username: string): Promise<AdminUserRecord | null>;
  findUserById(id: string): Promise<AdminUserRecord | null>;
  createUser(input: {
    username: string;
    passwordHash: string;
  }): Promise<AdminUserRecord>;
  updatePasswordAndRevokeSessions(input: {
    userId: string;
    passwordHash: string;
    revokedAt: Date;
  }): Promise<void>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<AdminSessionRecord>;
  findValidSessionByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionWithUser | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
  purgeExpiredSessions(now: Date): Promise<number>;
  findMfaSecretByUserId(userId: string): Promise<AdminMfaSecretRecord | null>;
  upsertMfaSecret(input: {
    userId: string;
    encryptedSecret: string;
    enabled: boolean;
    createdAt: Date;
  }): Promise<AdminMfaSecretRecord>;
  setMfaEnabled(userId: string, enabled: boolean): Promise<void>;
  deleteMfaForUser(userId: string): Promise<void>;
  replaceMfaRecoveryCodes(input: {
    userId: string;
    codeHashes: readonly string[];
    createdAt: Date;
  }): Promise<void>;
  findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<AdminMfaRecoveryCodeRecord | null>;
  markRecoveryCodeUsed(id: string, usedAt: Date): Promise<void>;
}
