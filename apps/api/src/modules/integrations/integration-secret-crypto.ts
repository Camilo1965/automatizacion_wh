import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class IntegrationSecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationSecretCryptoError';
  }
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new IntegrationSecretCryptoError(
      'INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }
  return key;
}

export class IntegrationSecretCrypto {
  private readonly key: Buffer;

  constructor(key: string) {
    this.key = decodeKey(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, ivRaw, tagRaw, encryptedRaw, extra] = value.split('.');
    if (
      version !== 'v1' ||
      ivRaw === undefined ||
      tagRaw === undefined ||
      encryptedRaw === undefined ||
      extra !== undefined
    ) {
      throw new IntegrationSecretCryptoError(
        'Encrypted integration secret is invalid',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(ivRaw, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedRaw, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new IntegrationSecretCryptoError(
        'Encrypted integration secret is invalid',
      );
    }
  }
}
