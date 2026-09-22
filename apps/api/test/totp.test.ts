import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildTotpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/modules/auth/totp.js';

function currentTotpCode(secretBase32: string, now: Date): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secretBase32.toUpperCase()) {
    const index = alphabet.indexOf(char);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = Math.floor(now.getTime() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

describe('totp', () => {
  it('generates secrets and verifies RFC 6238 codes', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-09-21T12:00:00.000Z');
    const code = currentTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, '000000', now)).toBe(false);
  });

  it('builds otpauth URIs', () => {
    const uri = buildTotpAuthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'KAIRO',
      accountName: 'camila',
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=KAIRO');
  });
});
