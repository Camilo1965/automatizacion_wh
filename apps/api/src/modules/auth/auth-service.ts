import { createHash, randomBytes } from 'node:crypto';

import type { IntegrationSecretCrypto } from '../integrations/integration-secret-crypto.js';
import type {
  AdminAuthRepository,
  AdminRole,
  AdminSessionRecord,
  AdminUserPublic,
} from './admin-auth-repository.js';
import {
  NoopAuthAuditSink,
  type AuthAuditSink,
} from './auth-audit-sink.js';
import {
  AuthenticationRequiredError,
  InvalidCredentialsError,
  InvalidMfaCodeError,
  MfaEncryptionRequiredError,
  MfaNotConfiguredError,
  PasswordMismatchError,
  UserNotFoundError,
} from './auth-errors.js';
import {
  AuthorizationDeniedError,
  requireCapability,
} from './authorize.js';
import {
  createMfaLoginToken,
  MfaLoginTokenError,
  verifyMfaLoginToken,
} from './mfa-login-token.js';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from './password.js';
import {
  createSessionToken,
  hashSessionToken,
  SESSION_DURATION_MS,
  sessionExpiresAt,
} from './session-token.js';
import {
  buildTotpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.js';
import { normalizeUsername } from './username.js';

const DEFAULT_IDLE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type AuthServiceOptions = {
  now?: () => Date;
  createToken?: () => string;
  dummyPasswordHash?: string;
  mfaCrypto?: IntegrationSecretCrypto;
  /** Base64-encoded 32-byte key (same as INTEGRATION_ENCRYPTION_KEY). */
  mfaSigningKeyBase64?: string;
  sessionIdleTtlMs?: number;
  sessionLastSeenThrottleMs?: number;
  absoluteSessionTtlMs?: number;
  auditSink?: AuthAuditSink;
};

export type LoginSessionResult = {
  kind: 'session';
  user: AdminUserPublic;
  token: string;
  expiresAt: Date;
};

export type LoginMfaRequiredResult = {
  kind: 'mfa_required';
  mfaToken: string;
  mfaExpiresAt: Date;
};

export type LoginResult = LoginSessionResult | LoginMfaRequiredResult;

export type MfaEnrollmentBeginResult = {
  secret: string;
  otpauthUri: string;
};

export type MfaEnrollmentConfirmResult = {
  recoveryCodes: string[];
};

export type MfaStatus = {
  enabled: boolean;
  pendingSetup: boolean;
};

export type PublicSessionInfo = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  current: boolean;
};

function toPublicUser(user: {
  id: string;
  username: string;
  role: AdminRole;
}): AdminUserPublic {
  return { id: user.id, username: user.username, role: user.role };
}

function requireMfaCrypto(
  crypto: IntegrationSecretCrypto | undefined,
): IntegrationSecretCrypto {
  if (crypto === undefined) {
    throw new MfaEncryptionRequiredError();
  }
  return crypto;
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateRecoveryCodes(count: number): string[] {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    codes.push(randomBytes(5).toString('hex'));
  }
  return codes;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly createToken: () => string;
  private readonly dummyPasswordHash: string;
  private readonly mfaCrypto: IntegrationSecretCrypto | undefined;
  private readonly mfaSigningKey: Buffer | undefined;
  private readonly sessionIdleTtlMs: number;
  private readonly sessionLastSeenThrottleMs: number;
  private readonly absoluteSessionTtlMs: number;
  private readonly auditSink: AuthAuditSink;

  constructor(
    private readonly repository: AdminAuthRepository,
    options: AuthServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createToken = options.createToken ?? createSessionToken;
    this.dummyPasswordHash = options.dummyPasswordHash ?? DUMMY_PASSWORD_HASH;
    this.mfaCrypto = options.mfaCrypto;
    if (options.mfaSigningKeyBase64 !== undefined) {
      this.mfaSigningKey = Buffer.from(options.mfaSigningKeyBase64, 'base64');
    } else {
      this.mfaSigningKey = undefined;
    }
    this.sessionIdleTtlMs = options.sessionIdleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.sessionLastSeenThrottleMs =
      options.sessionLastSeenThrottleMs ?? DEFAULT_LAST_SEEN_THROTTLE_MS;
    this.absoluteSessionTtlMs =
      options.absoluteSessionTtlMs ?? SESSION_DURATION_MS;
    this.auditSink = options.auditSink ?? new NoopAuthAuditSink();
  }

  async createUser(
    usernameInput: string,
    password: string,
    passwordConfirmation: string,
    role: AdminRole = 'owner',
  ): Promise<AdminUserPublic> {
    const username = normalizeUsername(usernameInput);
    this.assertPasswordConfirmation(password, passwordConfirmation);
    const passwordHash = await hashPassword(password);
    const user = await this.repository.createUser({
      username,
      passwordHash,
      role,
    });
    return toPublicUser(user);
  }

  async listUsers(actor: AdminUserPublic): Promise<AdminUserPublic[]> {
    requireCapability(actor, 'security:manage');
    const users = await this.repository.listUsers();
    return users.map(toPublicUser);
  }

  async createManagedUser(
    actor: AdminUserPublic,
    input: {
      username: string;
      password: string;
      passwordConfirmation: string;
      role: AdminRole;
      currentPassword: string;
    },
  ): Promise<AdminUserPublic> {
    requireCapability(actor, 'security:manage');
    await this.verifyCurrentPassword(actor.id, input.currentPassword);
    const created = await this.createUser(
      input.username,
      input.password,
      input.passwordConfirmation,
      input.role,
    );
    await this.auditSink.record({
      action: 'user.created',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'admin_user',
      targetId: created.id,
      metadata: { role: created.role },
      at: this.now(),
    });
    return created;
  }

  async updateUserRole(
    actor: AdminUserPublic,
    userId: string,
    input: { role: AdminRole; currentPassword: string },
  ): Promise<AdminUserPublic> {
    requireCapability(actor, 'security:manage');
    await this.verifyCurrentPassword(actor.id, input.currentPassword);
    if (actor.id === userId && input.role !== 'owner') {
      throw new AuthorizationDeniedError(
        'No puedes quitarte el rol de propietaria',
      );
    }
    const updated = await this.repository.updateUserRole({
      userId,
      role: input.role,
      updatedAt: this.now(),
    });
    await this.repository.revokeAllSessionsForUser(userId, this.now());
    const publicUser = toPublicUser(updated);
    await this.auditSink.record({
      action: 'role.changed',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'admin_user',
      targetId: publicUser.id,
      metadata: { role: publicUser.role },
      at: this.now(),
    });
    return publicUser;
  }

  async deactivateUser(
    actor: AdminUserPublic,
    userId: string,
    input: { currentPassword: string },
  ): Promise<AdminUserPublic> {
    requireCapability(actor, 'security:manage');
    await this.verifyCurrentPassword(actor.id, input.currentPassword);
    if (actor.id === userId) {
      throw new AuthorizationDeniedError(
        'No puedes desactivar tu propia cuenta',
      );
    }
    const updated = await this.repository.setUserActive({
      userId,
      active: false,
      updatedAt: this.now(),
    });
    await this.repository.revokeAllSessionsForUser(userId, this.now());
    const publicUser = toPublicUser(updated);
    await this.auditSink.record({
      action: 'user.deactivated',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'admin_user',
      targetId: publicUser.id,
      at: this.now(),
    });
    return publicUser;
  }

  private async verifyCurrentPassword(
    userId: string,
    currentPassword: string,
  ): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (user === null || !user.active) {
      throw new AuthenticationRequiredError();
    }
    const passwordMatches = await verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new InvalidCredentialsError('Contraseña de confirmación inválida');
    }
  }

  /** Owner re-auth for irreversible privacy/security actions. */
  async confirmCurrentPassword(
    actor: AdminUserPublic,
    currentPassword: string,
  ): Promise<void> {
    await this.verifyCurrentPassword(actor.id, currentPassword);
  }

  async resetPassword(
    usernameInput: string,
    password: string,
    passwordConfirmation: string,
  ): Promise<void> {
    const username = normalizeUsername(usernameInput);
    this.assertPasswordConfirmation(password, passwordConfirmation);
    const user = await this.repository.findUserByUsername(username);
    if (user === null) {
      throw new UserNotFoundError('User was not found');
    }

    const passwordHash = await hashPassword(password);
    await this.repository.updatePasswordAndRevokeSessions({
      userId: user.id,
      passwordHash,
      revokedAt: this.now(),
    });
  }

  async login(usernameInput: string, password: string): Promise<LoginResult> {
    try {
      const user = await this.authenticateCredentials(usernameInput, password);
      const mfa = await this.repository.findMfaSecretByUserId(user.id);
      if (mfa?.enabled === true) {
        requireMfaCrypto(this.mfaCrypto);
        if (this.mfaSigningKey === undefined) {
          throw new MfaEncryptionRequiredError();
        }
        const now = this.now();
        const { token, expiresAt } = createMfaLoginToken(
          user.id,
          now,
          this.mfaSigningKey,
        );
        return {
          kind: 'mfa_required',
          mfaToken: token,
          mfaExpiresAt: expiresAt,
        };
      }

      const session = await this.issueSession(user);
      await this.auditSink.record({
        action: 'login.succeeded',
        result: 'success',
        actorUserId: user.id,
        actorUsername: user.username,
        at: this.now(),
      });
      return session;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        await this.auditSink.record({
          action: 'login.failed',
          result: 'failure',
          at: this.now(),
        });
      }
      throw error;
    }
  }

  async completeMfaLogin(
    mfaToken: string,
    code: string,
  ): Promise<LoginSessionResult> {
    const crypto = requireMfaCrypto(this.mfaCrypto);
    if (this.mfaSigningKey === undefined) {
      throw new MfaEncryptionRequiredError();
    }
    const now = this.now();
    let userId: string;
    try {
      userId = verifyMfaLoginToken(mfaToken, now, this.mfaSigningKey);
    } catch (error) {
      await this.auditSink.record({
        action: 'mfa.verify_failed',
        result: 'failure',
        at: now,
        metadata: { reason: 'invalid_token' },
      });
      if (error instanceof MfaLoginTokenError) {
        throw new InvalidMfaCodeError(error.message);
      }
      throw error;
    }

    const user = await this.repository.findUserById(userId);
    if (user === null || !user.active) {
      await this.auditSink.record({
        action: 'mfa.verify_failed',
        result: 'failure',
        actorUserId: userId,
        at: now,
        metadata: { reason: 'inactive_user' },
      });
      throw new InvalidMfaCodeError();
    }

    const mfa = await this.repository.findMfaSecretByUserId(userId);
    if (mfa === null || !mfa.enabled) {
      throw new MfaNotConfiguredError();
    }

    const secret = crypto.decrypt(mfa.encryptedSecret);
    const recoveryHash = hashRecoveryCode(code);
    const recovery = await this.repository.findUnusedRecoveryCode(
      userId,
      recoveryHash,
    );
    const totpValid = verifyTotpCode(secret, code, now);
    if (!totpValid && recovery === null) {
      await this.auditSink.record({
        action: 'mfa.verify_failed',
        result: 'failure',
        actorUserId: user.id,
        actorUsername: user.username,
        at: now,
      });
      throw new InvalidMfaCodeError();
    }
    if (recovery !== null) {
      await this.repository.markRecoveryCodeUsed(recovery.id, now);
    }

    const session = await this.issueSession(user);
    await this.auditSink.record({
      action: 'mfa.verify_succeeded',
      result: 'success',
      actorUserId: user.id,
      actorUsername: user.username,
      at: now,
      metadata: { method: recovery !== null ? 'recovery' : 'totp' },
    });
    return session;
  }

  async getMfaStatus(userId: string): Promise<MfaStatus> {
    const mfa = await this.repository.findMfaSecretByUserId(userId);
    if (mfa === null) {
      return { enabled: false, pendingSetup: false };
    }
    return { enabled: mfa.enabled, pendingSetup: !mfa.enabled };
  }

  async beginMfaEnrollment(userId: string): Promise<MfaEnrollmentBeginResult> {
    const crypto = requireMfaCrypto(this.mfaCrypto);
    const user = await this.repository.findUserById(userId);
    if (user === null) {
      throw new UserNotFoundError('User was not found');
    }

    const secret = generateTotpSecret();
    const now = this.now();
    await this.repository.upsertMfaSecret({
      userId,
      encryptedSecret: crypto.encrypt(secret),
      enabled: false,
      createdAt: now,
    });

    return {
      secret,
      otpauthUri: buildTotpAuthUri({
        secret,
        issuer: 'KAIRO',
        accountName: user.username,
      }),
    };
  }

  async confirmMfaEnrollment(
    userId: string,
    code: string,
  ): Promise<MfaEnrollmentConfirmResult> {
    const crypto = requireMfaCrypto(this.mfaCrypto);
    const mfa = await this.repository.findMfaSecretByUserId(userId);
    if (mfa === null) {
      throw new MfaNotConfiguredError('Complete MFA setup first');
    }
    const secret = crypto.decrypt(mfa.encryptedSecret);
    if (!verifyTotpCode(secret, code, this.now())) {
      throw new InvalidMfaCodeError();
    }

    await this.repository.setMfaEnabled(userId, true);
    const recoveryCodes = generateRecoveryCodes(8);
    const now = this.now();
    await this.repository.replaceMfaRecoveryCodes({
      userId,
      codeHashes: recoveryCodes.map((value) => hashRecoveryCode(value)),
      createdAt: now,
    });
    await this.auditSink.record({
      action: 'mfa.enabled',
      result: 'success',
      actorUserId: userId,
      at: now,
    });

    return { recoveryCodes };
  }

  async disableMfa(
    userId: string,
    password: string,
    currentSessionToken: string | null | undefined,
  ): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (user === null) {
      throw new UserNotFoundError('User was not found');
    }
    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }
    await this.repository.deleteMfaForUser(userId);
    const now = this.now();
    const current = await this.resolveSession(currentSessionToken, now, false);
    if (current !== null) {
      await this.repository.revokeOtherSessionsForUser(
        userId,
        current.session.id,
        now,
      );
    } else {
      await this.repository.revokeAllSessionsForUser(userId, now);
    }
    await this.auditSink.record({
      action: 'mfa.disabled',
      result: 'success',
      actorUserId: userId,
      actorUsername: user.username,
      at: now,
    });
  }

  async purgeExpiredSessions(): Promise<number> {
    return this.repository.purgeExpiredSessions(this.now());
  }

  async getSession(token: string | null | undefined): Promise<AdminUserPublic> {
    const found = await this.resolveSession(token, this.now(), true);
    if (found === null) {
      throw new AuthenticationRequiredError();
    }
    return toPublicUser(found.user);
  }

  async listSessions(
    token: string | null | undefined,
  ): Promise<PublicSessionInfo[]> {
    const found = await this.resolveSession(token, this.now(), true);
    if (found === null) {
      throw new AuthenticationRequiredError();
    }
    const now = this.now();
    const sessions = await this.repository.listActiveSessionsForUser(
      found.user.id,
      now,
    );
    return sessions
      .filter((session) => this.isWithinIdleWindow(session, now))
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        current: session.id === found.session.id,
      }));
  }

  async revokeSessionById(
    token: string | null | undefined,
    sessionId: string,
  ): Promise<void> {
    const found = await this.resolveSession(token, this.now(), true);
    if (found === null) {
      throw new AuthenticationRequiredError();
    }
    const sessions = await this.repository.listActiveSessionsForUser(
      found.user.id,
      this.now(),
    );
    const target = sessions.find((session) => session.id === sessionId);
    if (target === undefined) {
      throw new AuthenticationRequiredError();
    }
    const now = this.now();
    await this.repository.revokeSession(sessionId, now);
    await this.auditSink.record({
      action: 'session.revoked',
      result: 'success',
      actorUserId: found.user.id,
      actorUsername: found.user.username,
      targetType: 'admin_session',
      targetId: sessionId,
      at: now,
    });
  }

  async revokeOtherSessions(token: string | null | undefined): Promise<void> {
    const found = await this.resolveSession(token, this.now(), true);
    if (found === null) {
      throw new AuthenticationRequiredError();
    }
    const now = this.now();
    await this.repository.revokeOtherSessionsForUser(
      found.user.id,
      found.session.id,
      now,
    );
    await this.auditSink.record({
      action: 'session.revoked_others',
      result: 'success',
      actorUserId: found.user.id,
      actorUsername: found.user.username,
      at: now,
    });
  }

  async logout(token: string | null | undefined): Promise<void> {
    if (token === null || token === undefined || token === '') {
      return;
    }

    const now = this.now();
    const found = await this.repository.findValidSessionByTokenHash(
      hashSessionToken(token),
      now,
    );

    if (found === null) {
      return;
    }

    await this.repository.revokeSession(found.session.id, now);
  }

  private async authenticateCredentials(
    usernameInput: string,
    password: string,
  ): Promise<{
    id: string;
    username: string;
    passwordHash: string;
    role: AdminRole;
    active: boolean;
  }> {
    let username: string;
    try {
      username = normalizeUsername(usernameInput);
    } catch {
      await verifyPassword(password, this.dummyPasswordHash);
      throw new InvalidCredentialsError();
    }

    const user = await this.repository.findUserByUsername(username);
    const passwordHash = user?.passwordHash ?? this.dummyPasswordHash;
    const passwordMatches = await verifyPassword(password, passwordHash);

    if (user === null || !passwordMatches || !user.active) {
      throw new InvalidCredentialsError();
    }

    return user;
  }

  private async issueSession(user: {
    id: string;
    username: string;
    role: AdminRole;
  }): Promise<LoginSessionResult> {
    const now = this.now();
    const token = this.createToken();
    const expiresAt =
      this.absoluteSessionTtlMs === SESSION_DURATION_MS
        ? sessionExpiresAt(now)
        : new Date(now.getTime() + this.absoluteSessionTtlMs);
    await this.repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    });

    return {
      kind: 'session',
      user: toPublicUser(user),
      token,
      expiresAt,
    };
  }

  private isWithinIdleWindow(session: AdminSessionRecord, now: Date): boolean {
    const lastActivity = session.lastSeenAt.getTime();
    return now.getTime() - lastActivity <= this.sessionIdleTtlMs;
  }

  private async resolveSession(
    token: string | null | undefined,
    now: Date,
    touch: boolean,
  ): Promise<{
    session: AdminSessionRecord;
    user: {
      id: string;
      username: string;
      passwordHash: string;
      role: AdminRole;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
  } | null> {
    if (token === null || token === undefined || token === '') {
      return null;
    }

    const found = await this.repository.findValidSessionByTokenHash(
      hashSessionToken(token),
      now,
    );

    if (found === null || !found.user.active) {
      return null;
    }

    if (!this.isWithinIdleWindow(found.session, now)) {
      return null;
    }

    if (touch) {
      const elapsed = now.getTime() - found.session.lastSeenAt.getTime();
      if (elapsed >= this.sessionLastSeenThrottleMs) {
        await this.repository.touchSessionLastSeen(found.session.id, now);
        found.session = { ...found.session, lastSeenAt: now };
      }
    }

    return found;
  }

  private assertPasswordConfirmation(
    password: string,
    passwordConfirmation: string,
  ): void {
    if (password !== passwordConfirmation) {
      throw new PasswordMismatchError();
    }
  }
}
