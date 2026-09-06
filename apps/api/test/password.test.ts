import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  PasswordValidationError,
  validatePassword,
  verifyPassword,
} from '../src/modules/auth/password.js';

describe('validatePassword', () => {
  it('accepts passwords between 12 and 128 characters including spaces and unicode', () => {
    expect(validatePassword('password1234')).toBe('password1234');
    expect(validatePassword('  spaced pass  ')).toBe('  spaced pass  ');
    expect(validatePassword('contraseña-ñáéí')).toBe('contraseña-ñáéí');
    expect(validatePassword('x'.repeat(128))).toBe('x'.repeat(128));
  });

  it('rejects passwords shorter than 12 or longer than 128 without trimming', () => {
    expect(() => validatePassword('short')).toThrow(PasswordValidationError);
    expect(() => validatePassword('x'.repeat(11))).toThrow(
      PasswordValidationError,
    );
    expect(() => validatePassword('x'.repeat(129))).toThrow(
      PasswordValidationError,
    );
    expect(() => validatePassword('           ')).toThrow(
      PasswordValidationError,
    );
  });
});

describe('hashPassword and verifyPassword', () => {
  it('hashes with versioned scrypt format and verifies successfully', async () => {
    const password = 'correct horse';
    const hash = await hashPassword(password);

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).toContain('n=131072');
    expect(hash).toContain('r=8');
    expect(hash).toContain('p=1');
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('uses a distinct salt for the same password', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');
    expect(first).not.toBe(second);
  });

  it('rejects corrupt and unknown hash formats', async () => {
    await expect(verifyPassword('correct horse', 'md5$deadbeef')).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword('correct horse', 'scrypt$broken'),
    ).resolves.toBe(false);
    await expect(verifyPassword('correct horse', '')).resolves.toBe(false);
  });
});
