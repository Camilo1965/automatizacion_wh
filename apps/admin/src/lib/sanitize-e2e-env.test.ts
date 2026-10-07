import { describe, expect, it } from 'vitest';

import { sanitizeE2eEnv } from './sanitize-e2e-env';

describe('sanitizeE2eEnv', () => {
  it('keeps required process/test settings while excluding unrelated host values', () => {
    const input: Record<string, string | undefined> = {
      NO_COLOR: '1',
      FORCE_COLOR: undefined,
      KEEP_ME: 'yes',
      PATH: '/usr/bin',
      DATABASE_URL: 'postgresql://localhost/camila_test',
      HOST: '127.0.0.1',
      PORT: '3100',
      CAMILA_E2E_ENV_DIR: 'C:/temp/camila-e2e-env',
      S3_SECRET_ACCESS_KEY: 'should never inherit',
      WHATSAPP_ACCESS_TOKEN: 'should never inherit',
      KAIRO_CONFIG_ENCRYPTION_KEY: 'host-key',
    };

    const output = sanitizeE2eEnv(input);

    expect(Object.hasOwn(output, 'NO_COLOR')).toBe(false);
    expect(Object.hasOwn(output, 'KEEP_ME')).toBe(false);
    expect(output.PATH).toBe('/usr/bin');
    expect(output.DATABASE_URL).toContain('camila_test');
    expect(output.HOST).toBe('127.0.0.1');
    expect(output.PORT).toBe('3100');
    expect(output.CAMILA_E2E_ENV_DIR).toBe('C:/temp/camila-e2e-env');
    expect(Object.hasOwn(output, 'S3_SECRET_ACCESS_KEY')).toBe(false);
    expect(Object.hasOwn(output, 'WHATSAPP_ACCESS_TOKEN')).toBe(false);
    expect(Object.hasOwn(output, 'KAIRO_CONFIG_ENCRYPTION_KEY')).toBe(false);
    expect(Object.hasOwn(output, 'FORCE_COLOR')).toBe(false);
  });

  it('preserves FORCE_COLOR when present and still drops NO_COLOR', () => {
    const output = sanitizeE2eEnv({
      NO_COLOR: '1',
      FORCE_COLOR: '1',
      PATH: '/usr/bin',
    });

    expect(Object.hasOwn(output, 'NO_COLOR')).toBe(false);
    expect(output.FORCE_COLOR).toBe('1');
    expect(output.PATH).toBe('/usr/bin');
  });
});
