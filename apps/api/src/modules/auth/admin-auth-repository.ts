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
}
