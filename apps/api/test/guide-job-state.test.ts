import { describe, expect, it } from 'vitest';

import { assertGuideJobTransition } from '../src/modules/shipping/guide-job-state.js';

describe('guide job state transitions', () => {
  it('allows claiming a pending job', () => {
    expect(assertGuideJobTransition('pending', 'claim')).toBe('processing');
  });

  it('allows processing outcomes', () => {
    expect(assertGuideJobTransition('processing', 'mark_created')).toBe(
      'created',
    );
    expect(assertGuideJobTransition('processing', 'mark_uncertain')).toBe(
      'uncertain',
    );
    expect(assertGuideJobTransition('processing', 'mark_failed')).toBe(
      'failed',
    );
  });

  it('allows resolving uncertain jobs', () => {
    expect(assertGuideJobTransition('uncertain', 'resolve_uncertain')).toBe(
      'created',
    );
  });

  it('rejects illegal transitions', () => {
    expect(() => assertGuideJobTransition('created', 'claim')).toThrow(
      'not allowed',
    );
    expect(() => assertGuideJobTransition('failed', 'mark_created')).toThrow(
      'not allowed',
    );
    expect(() => assertGuideJobTransition('pending', 'mark_created')).toThrow(
      'not allowed',
    );
  });
});
