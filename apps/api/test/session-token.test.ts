import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  hashSessionToken,
  sessionExpiresAt,
  SESSION_DURATION_MS,
} from '../src/modules/auth/session-token.js';

describe('session tokens', () => {
  it('creates a 32-byte base64url token', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const bytes = Buffer.from(token, 'base64url');
    expect(bytes.length).toBe(32);
  });

  it('stores only the SHA-256 hex digest', () => {
    const token = createSessionToken();
    const digest = hashSessionToken(token);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(createHash('sha256').update(token).digest('hex'));
    expect(digest).not.toBe(token);
  });

  it('expires exactly 12 hours after creation', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    expect(SESSION_DURATION_MS).toBe(12 * 60 * 60 * 1000);
    expect(sessionExpiresAt(now).toISOString()).toBe(
      '2026-09-07T00:00:00.000Z',
    );
  });
});
