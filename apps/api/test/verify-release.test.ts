/* eslint-disable @typescript-eslint/ban-ts-comment -- release runner is plain JavaScript */
// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
  RELEASE_STEPS,
  runReleaseSteps,
} from '../../../scripts/lib/release-steps.mjs';

describe('local release runner', () => {
  it('stops at the first failing gate and returns its exit code', () => {
    const calls: string[] = [];
    const steps = [
      { name: 'first', command: 'one', args: [] },
      { name: 'second', command: 'two', args: [] },
      { name: 'third', command: 'three', args: [] },
    ];

    const exitCode = runReleaseSteps(steps, (step: { name: string }) => {
      calls.push(step.name);
      return step.name === 'second' ? 7 : 0;
    });

    expect(exitCode).toBe(7);
    expect(calls).toEqual(['first', 'second']);
  });

  it('declares concrete commands for every local release gate', () => {
    expect(RELEASE_STEPS.length).toBeGreaterThanOrEqual(7);
    expect(RELEASE_STEPS.map((step: { name: string }) => step.name)).toEqual(
      expect.arrayContaining([
        'functional',
        'coverage',
        'production-smoke',
        'secrets',
        'filesystem',
        'images',
      ]),
    );
    for (const step of RELEASE_STEPS) {
      expect(step.name.trim()).not.toBe('');
      expect(step.command.trim()).not.toBe('');
      expect(step.args.length).toBeGreaterThan(0);
    }
  });
});
