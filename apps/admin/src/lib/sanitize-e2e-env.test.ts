import { describe, expect, it } from 'vitest';

import { sanitizeE2eEnv } from './sanitize-e2e-env';

describe('sanitizeE2eEnv', () => {
  it('removes NO_COLOR unconditionally and keeps unrelated keys', () => {
    const input: Record<string, string | undefined> = {
      NO_COLOR: '1',
      FORCE_COLOR: undefined,
      KEEP_ME: 'yes',
    };

    const output = sanitizeE2eEnv(input);

    expect(Object.hasOwn(output, 'NO_COLOR')).toBe(false);
    expect(output.KEEP_ME).toBe('yes');
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
