import type {
  AdminAuthRepository,
  AdminUserPublic,
} from './admin-auth-repository.js';
import {
  AuthenticationRequiredError,
  InvalidCredentialsError,
  PasswordMismatchError,
  UserNotFoundError,
} from './auth-errors.js';
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
import { normalizeUsername } from './username.js';

export type AuthServiceOptions = {
  now?: () => Date;
  createToken?: () => string;
  dummyPasswordHash?: string;
};

export type LoginResult = {
  user: AdminUserPublic;
  token: string;
  expiresAt: Date;
};

function toPublicUser(user: { id: string; username: string }): AdminUserPublic {
  return { id: user.id, username: user.username };
}

export class AuthService {
  private readonly now: () => Date;
  private readonly createToken: () => string;
  private readonly dummyPasswordHash: string;

  constructor(
    private readonly repository: AdminAuthRepository,
    options: AuthServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createToken = options.createToken ?? createSessionToken;
    this.dummyPasswordHash = options.dummyPasswordHash ?? DUMMY_PASSWORD_HASH;
  }

  async createUser(
    usernameInput: string,
    password: string,
    passwordConfirmation: string,
  ): Promise<AdminUserPublic> {
    const username = normalizeUsername(usernameInput);
    this.assertPasswordConfirmation(password, passwordConfirmation);
    const passwordHash = await hashPassword(password);
    const user = await this.repository.createUser({ username, passwordHash });
    return toPublicUser(user);
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
      user: toPublicUser(user),
      token,
      expiresAt,
    };
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

  private assertPasswordConfirmation(
    password: string,
    passwordConfirmation: string,
  ): void {
    if (password !== passwordConfirmation) {
      throw new PasswordMismatchError();
    }
  }
}
