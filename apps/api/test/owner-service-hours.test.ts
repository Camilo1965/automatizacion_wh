import { describe, expect, it } from 'vitest';
import { ownerAvailabilityMessage } from '../src/modules/conversations/owner-service-hours.js';
describe('owner availability', () => {
  const settings = {
    serviceHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  };
  it('uses Bogota time and leaves the automatic sales flow available outside human hours', () => {
    expect(
      ownerAvailabilityMessage(settings, new Date('2026-09-16T15:00:00Z')),
    ).toBe('');
    expect(
      ownerAvailabilityMessage(settings, new Date('2026-09-17T01:00:00Z')),
    ).toContain('09:00');
    expect(ownerAvailabilityMessage({ serviceHours: null })).toBe('');
  });
});
