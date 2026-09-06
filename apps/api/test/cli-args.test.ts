import { describe, expect, it } from 'vitest';

import { readUsernameArg, requireDatabaseUrl } from '../src/cli/cli-args.js';

describe('cli args', () => {
  it('reads --username', () => {
    expect(readUsernameArg(['--username', 'camila'])).toBe('camila');
  });

  it('rejects missing username', () => {
    expect(() => readUsernameArg([])).toThrow(/--username/);
    expect(() => readUsernameArg(['--username'])).toThrow(/--username/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL/);
    expect(requireDatabaseUrl({ DATABASE_URL: 'postgresql://x/y' })).toBe(
      'postgresql://x/y',
    );
  });
});
