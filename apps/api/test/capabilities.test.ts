import { describe, expect, it } from 'vitest';

import {
  hasCapability,
  type AdminRole,
  type Capability,
} from '../src/modules/auth/capabilities.js';

const OWNER_ONLY: Capability[] = [
  'integrations:manage',
  'audit:read',
  'security:manage',
];

const OPERATOR_CAPS: Capability[] = [
  'catalog:operate',
  'orders:operate',
  'conversations:operate',
  'shipping:operate',
  'inventory:operate',
  'alerts:operate',
];

const ALL_CAPS: Capability[] = [...OPERATOR_CAPS, ...OWNER_ONLY];

function user(role: AdminRole) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    username: role === 'owner' ? 'owner' : 'operator',
    role,
  };
}

describe('hasCapability', () => {
  it('grants every capability to owners', () => {
    const owner = user('owner');
    for (const capability of ALL_CAPS) {
      expect(hasCapability(owner, capability)).toBe(true);
    }
  });

  it('grants only operate capabilities to operators', () => {
    const operator = user('operator');
    for (const capability of OPERATOR_CAPS) {
      expect(hasCapability(operator, capability)).toBe(true);
    }
  });

  it('denies integrations, security and audit to operators', () => {
    const operator = user('operator');
    expect(hasCapability(operator, 'integrations:manage')).toBe(false);
    expect(hasCapability(operator, 'security:manage')).toBe(false);
    expect(hasCapability(operator, 'audit:read')).toBe(false);
  });

  it('denies capabilities when user is null', () => {
    expect(hasCapability(null, 'catalog:operate')).toBe(false);
    expect(hasCapability(null, 'security:manage')).toBe(false);
  });
});
