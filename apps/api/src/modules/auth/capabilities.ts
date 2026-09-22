import type { AdminUserPublic } from './admin-auth-repository.js';

export type AdminRole = 'owner' | 'operator';

export type Capability =
  | 'catalog:operate'
  | 'orders:operate'
  | 'conversations:operate'
  | 'shipping:operate'
  | 'inventory:operate'
  | 'alerts:operate'
  | 'integrations:manage'
  | 'audit:read'
  | 'security:manage';

const OPERATOR_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'catalog:operate',
  'orders:operate',
  'conversations:operate',
  'shipping:operate',
  'inventory:operate',
  'alerts:operate',
]);

const OWNER_CAPABILITIES: ReadonlySet<Capability> = new Set([
  ...OPERATOR_CAPABILITIES,
  'integrations:manage',
  'audit:read',
  'security:manage',
]);

export function hasCapability(
  user: AdminUserPublic | null,
  capability: Capability,
): boolean {
  if (user === null) {
    return false;
  }
  if (user.role === 'owner') {
    return OWNER_CAPABILITIES.has(capability);
  }
  if (user.role === 'operator') {
    return OPERATOR_CAPABILITIES.has(capability);
  }
  return false;
}
