import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyWhatsAppSignature } from '../src/modules/whatsapp/whatsapp-signature.js';

const appSecret = 'test-meta-app-secret';
const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');

function signatureFor(body: Buffer): string {
  return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
}

describe('verifyWhatsAppSignature', () => {
  it('accepts a Meta SHA-256 signature for the exact raw body', () => {
    expect(
      verifyWhatsAppSignature(rawBody, signatureFor(rawBody), appSecret),
    ).toBe(true);
  });

  it('rejects absent, malformed, or changed signatures and bodies', () => {
    expect(verifyWhatsAppSignature(rawBody, undefined, appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(rawBody, 'sha256=wrong', appSecret)).toBe(
      false,
    );
    expect(
      verifyWhatsAppSignature(
        Buffer.from('{"object":"altered"}', 'utf8'),
        signatureFor(rawBody),
        appSecret,
      ),
    ).toBe(false);
    expect(
      verifyWhatsAppSignature(rawBody, signatureFor(rawBody), undefined),
    ).toBe(false);
  });
});
