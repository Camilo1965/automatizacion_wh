import { describe, expect, it } from 'vitest';

import {
  createMfaLoginToken,
  MfaLoginTokenError,
  verifyMfaLoginToken,
} from '../src/modules/auth/mfa-login-token.js';

const key = Buffer.alloc(32, 7);
const now = new Date('2026-09-22T12:00:00.000Z');

describe('MFA login token', () => {
  it('round-trips a signed token until its exact expiry', () => {
    const { token, expiresAt } = createMfaLoginToken('owner-1', now, key);
    expect(expiresAt.toISOString()).toBe('2026-09-22T12:05:00.000Z');
    expect(verifyMfaLoginToken(token, now, key)).toBe('owner-1');
    expect(() => verifyMfaLoginToken(token, expiresAt, key)).toThrow(
      MfaLoginTokenError,
    );
  });

  it('rejects malformed, non-numeric, tampered and wrong-key tokens', () => {
    const { token } = createMfaLoginToken('owner-1', now, key);
    const [user, expiry, signature] = token.split('.');
    expect(() => verifyMfaLoginToken('bad', now, key)).toThrow(
      'Invalid MFA login token',
    );
    expect(() =>
      verifyMfaLoginToken(`${user}.NaN.${signature}`, now, key),
    ).toThrow('MFA login token expired');
    expect(() =>
      verifyMfaLoginToken(`${user}.${expiry}.short`, now, key),
    ).toThrow('Invalid MFA login token');
    expect(() =>
      verifyMfaLoginToken(
        `${user}.${expiry}.${signature}`,
        now,
        Buffer.alloc(32, 8),
      ),
    ).toThrow('Invalid MFA login token');
    expect(() =>
      verifyMfaLoginToken(`intruder.${expiry}.${signature}`, now, key),
    ).toThrow('Invalid MFA login token');
  });
});
