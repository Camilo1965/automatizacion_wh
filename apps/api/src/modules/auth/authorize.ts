import type { AdminUserPublic } from './admin-auth-repository.js';
import { hasCapability, type Capability } from './capabilities.js';

export class AuthorizationDeniedError extends Error {
  readonly code = 'authorization_denied';

  constructor(message = 'No tienes permiso para realizar esta acción') {
    super(message);
    this.name = 'AuthorizationDeniedError';
  }
}

export function requireCapability(
  user: AdminUserPublic | null,
  capability: Capability,
): asserts user is AdminUserPublic {
  if (!hasCapability(user, capability)) {
    throw new AuthorizationDeniedError();
  }
}
