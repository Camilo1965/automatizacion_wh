import { createHash, randomBytes } from 'node:crypto';

import type { IntegrationSecretCrypto } from '../integrations/integration-secret-crypto.js';
import type {
  AdminAuthRepository,
  AdminRole,
  AdminUserPublic,
} from './admin-auth-repository.js';
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
  sessionExpiresAt,
} from './session-token.js';
import {
  buildTotpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.js';
import { normalizeUsername } from './username.js';

export type AuthServiceOptions = {
  now?: () => Date;
  createToken?: () => string;
  dummyPasswordHash?: string;
  mfaCrypto?: IntegrationSecretCrypto;
  /** Base64-encoded 32-byte key (same as INTEGRATION_ENCRYPTION_KEY). */
  mfaSigningKeyBase64?: string;
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
    return this.createUser(
      input.username,
      input.password,
      input.passwordConfirmation,
      input.role,
    );
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
    return toPublicUser(updated);
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
    return toPublicUser(updated);
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

    return this.issueSession(user);
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
      if (error instanceof MfaLoginTokenError) {
        throw new InvalidMfaCodeError(error.message);
      }
      throw error;
    }

    const user = await this.repository.findUserById(userId);
    if (user === null || !user.active) {
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
      throw new InvalidMfaCodeError();
    }
    if (recovery !== null) {
      await this.repository.markRecoveryCodeUsed(recovery.id, now);
    }

    return this.issueSession(user);
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

    return { recoveryCodes };
  }

  async disableMfa(userId: string, password: string): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (user === null) {
      throw new UserNotFoundError('User was not found');
    }
    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }
    await this.repository.deleteMfaForUser(userId);
  }

  async purgeExpiredSessions(): Promise<number> {
    return this.repository.purgeExpiredSessions(this.now());
  }

  async getSession(token: string | null | undefined): Promise<AdminUserPublic> {
    if (token === null || token === undefined || token === '') {
      throw new AuthenticationRequiredError();
    }

    const now = this.now();
    const found = await this.repository.findValidSessionByTokenHash(
      hashSessionToken(token),
      now,
    );

    if (found === null || !found.user.active) {
      throw new AuthenticationRequiredError();
    }

    return toPublicUser(found.user);
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
    const expiresAt = sessionExpiresAt(now);
    await this.repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      createdAt: now,
    });

    return {
      kind: 'session',
      user: toPublicUser(user),
      token,
      expiresAt,
    };
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
