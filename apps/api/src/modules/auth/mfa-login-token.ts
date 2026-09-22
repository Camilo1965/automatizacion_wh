import { createHmac, timingSafeEqual } from 'node:crypto';

const MFA_LOGIN_TTL_MS = 5 * 60 * 1000;

export class MfaLoginTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaLoginTokenError';
  }
}

export function createMfaLoginToken(
  userId: string,
  now: Date,
  signingKey: Buffer,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + MFA_LOGIN_TTL_MS);
  const payload = `${userId}.${expiresAt.getTime()}`;
  const signature = signPayload(payload, signingKey);
  return { token: `${payload}.${signature}`, expiresAt };
}

export function verifyMfaLoginToken(
  token: string,
  now: Date,
  signingKey: Buffer,
): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new MfaLoginTokenError('Invalid MFA login token');
  }
  const userId = parts[0];
  const expiresRaw = parts[1];
  const signature = parts[2];
  if (
    userId === undefined ||
    expiresRaw === undefined ||
    signature === undefined
  ) {
    throw new MfaLoginTokenError('Invalid MFA login token');
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new MfaLoginTokenError('MFA login token expired');
  }
  const payload = `${userId}.${expiresRaw}`;
  const expected = signPayload(payload, signingKey);
  const sigBuf = Buffer.from(signature, 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new MfaLoginTokenError('Invalid MFA login token');
  }
  return userId;
}

function signPayload(payload: string, signingKey: Buffer): string {
  return createHmac('sha256', signingKey).update(payload).digest('base64url');
}
