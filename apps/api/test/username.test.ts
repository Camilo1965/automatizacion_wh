import { describe, expect, it } from 'vitest';

import {
  normalizeUsername,
  UsernameValidationError,
} from '../src/modules/auth/username.js';

describe('normalizeUsername', () => {
  it('trims and lowercases valid usernames', () => {
    expect(normalizeUsername('  Camila.User_1-x  ')).toBe('camila.user_1-x');
    expect(normalizeUsername('abc')).toBe('abc');
    expect(normalizeUsername('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('rejects invalid usernames', () => {
    for (const value of [
      'ab',
      'a'.repeat(65),
      'Camila!',
      'user name',
      'ñame',
      '',
      '   ',
    ]) {
      expect(() => normalizeUsername(value)).toThrow(UsernameValidationError);
    }
  });
});
