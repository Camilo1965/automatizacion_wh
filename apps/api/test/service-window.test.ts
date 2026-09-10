import { describe, expect, it } from 'vitest';

import { evaluateServiceWindow } from '../src/modules/conversations/service-window.js';

describe('evaluateServiceWindow', () => {
  it('closes exactly 24 hours after the latest customer message', () => {
    const inbound = new Date('2026-09-09T13:00:00Z');
    expect(
      evaluateServiceWindow(inbound, new Date('2026-09-10T12:59:59Z')).open,
    ).toBe(true);
    expect(
      evaluateServiceWindow(inbound, new Date('2026-09-10T13:00:00Z')),
    ).toEqual({
      open: false,
      expiresAt: new Date('2026-09-10T13:00:00Z'),
    });
  });
});
