import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (
    appSecret === undefined ||
    header === undefined ||
    !/^sha256=[a-f0-9]{64}$/.test(header)
  ) {
    return false;
  }

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = header.slice('sha256='.length);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
