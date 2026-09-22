import { describe, expect, it } from 'vitest';

import { hasCapability } from '../src/modules/auth/capabilities.js';

describe('hasCapability', () => {
  it('grants all capabilities to authenticated admins', () => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'camila',
    };
    expect(hasCapability(user, 'security')).toBe(true);
    expect(hasCapability(user, 'audit')).toBe(true);
  });

  it('denies capabilities when user is null', () => {
    expect(hasCapability(null, 'catalog')).toBe(false);
  });
});
