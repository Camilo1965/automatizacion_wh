import { describe, expect, it } from 'vitest';

import {
  AuthenticationRequiredError,
  AuthValidationError,
  InvalidCredentialsError,
  InvalidMfaCodeError,
  MfaEncryptionRequiredError,
  MfaNotConfiguredError,
  PasswordMismatchError,
  UserNotFoundError,
  UsernameConflictError,
} from '../src/modules/auth/auth-errors.js';

describe('authentication error contracts', () => {
  it('retains validation codes and optional field metadata', () => {
    const withField = new AuthValidationError('invalid', 'Bad field', 'email');
    const withoutField = new AuthValidationError('invalid', 'Bad request');
    expect(withField).toMatchObject({
      name: 'AuthValidationError',
      code: 'invalid',
      field: 'email',
      message: 'Bad field',
    });
    expect(withoutField.field).toBeUndefined();
    expect(new PasswordMismatchError()).toMatchObject({
      code: 'password_mismatch',
      field: 'passwordConfirmation',
    });
    expect(new PasswordMismatchError('Custom mismatch').message).toBe(
      'Custom mismatch',
    );
  });

  it('retains stable codes and default/custom messages for operational errors', () => {
    const cases = [
      [new UsernameConflictError('Already exists'), 'username_conflict'],
      [new UserNotFoundError('Missing'), 'user_not_found'],
      [new InvalidCredentialsError(), 'invalid_credentials'],
      [new AuthenticationRequiredError(), 'authentication_required'],
      [new MfaEncryptionRequiredError(), 'mfa_encryption_required'],
      [new InvalidMfaCodeError(), 'invalid_mfa_code'],
      [new MfaNotConfiguredError(), 'mfa_not_configured'],
    ] as const;
    for (const [error, code] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
    }
    expect(new InvalidCredentialsError('Nope').message).toBe('Nope');
    expect(new AuthenticationRequiredError('Login').message).toBe('Login');
    expect(new MfaEncryptionRequiredError('Key').message).toBe('Key');
    expect(new InvalidMfaCodeError('Code').message).toBe('Code');
    expect(new MfaNotConfiguredError('Disabled').message).toBe('Disabled');
  });
});
