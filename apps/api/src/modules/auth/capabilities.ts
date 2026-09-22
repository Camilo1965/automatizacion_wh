import type { AdminUserPublic } from './admin-auth-repository.js';

export type Capability =
  | 'catalog'
  | 'orders'
  | 'conversations'
  | 'shipping'
  | 'integrations'
  | 'inventory'
  | 'alerts'
  | 'audit'
  | 'security';

export function hasCapability(
  user: AdminUserPublic | null,
  cap: Capability,
): boolean {
  if (user === null) {
    return false;
  }
  void cap;
  return true;
}
