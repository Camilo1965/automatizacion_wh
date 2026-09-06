export class UsernameValidationError extends Error {
  readonly code = 'invalid_username';

  constructor(message: string) {
    super(message);
    this.name = 'UsernameValidationError';
  }
}

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length < 3 || normalized.length > 64) {
    throw new UsernameValidationError(
      'Username must be between 3 and 64 characters',
    );
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new UsernameValidationError(
      'Username may only contain lowercase letters, digits, dots, underscores, and hyphens',
    );
  }

  return normalized;
}
