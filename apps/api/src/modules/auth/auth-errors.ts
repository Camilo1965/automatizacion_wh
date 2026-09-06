export class AuthValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'AuthValidationError';
    this.code = code;
    if (field !== undefined) {
      this.field = field;
    }
  }
}

export class PasswordMismatchError extends AuthValidationError {
  constructor(message = 'Password confirmation does not match') {
    super('password_mismatch', message, 'passwordConfirmation');
    this.name = 'PasswordMismatchError';
  }
}

export class UsernameConflictError extends Error {
  readonly code = 'username_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'UsernameConflictError';
  }
}

export class UserNotFoundError extends Error {
  readonly code = 'user_not_found';

  constructor(message: string) {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials';

  constructor(message = 'Credenciales inválidas') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class AuthenticationRequiredError extends Error {
  readonly code = 'authentication_required';

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}
