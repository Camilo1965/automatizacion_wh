import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  IntegrationSecretCrypto,
  IntegrationSecretCryptoError,
} from '../src/modules/integrations/integration-secret-crypto.js';

describe('IntegrationSecretCrypto', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips a secret without retaining plaintext in its ciphertext', () => {
    const crypto = new IntegrationSecretCrypto(key);
    const encrypted = crypto.encrypt('sensitive-token');

    expect(encrypted).not.toContain('sensitive-token');
    expect(crypto.decrypt(encrypted)).toBe('sensitive-token');
  });

  it('rejects malformed keys and tampered payloads', () => {
    expect(() => new IntegrationSecretCrypto('not-a-key')).toThrow(
      IntegrationSecretCryptoError,
    );
    const crypto = new IntegrationSecretCrypto(key);
    expect(() => crypto.decrypt('v1.bad.payload')).toThrow(
      IntegrationSecretCryptoError,
    );
  });
});
