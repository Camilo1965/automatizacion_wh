/* eslint-disable @typescript-eslint/ban-ts-comment -- coverage gate is a plain JavaScript release module */
// @ts-nocheck
import { describe, expect, it } from 'vitest';

import { evaluateFileCoverage } from '../../../scripts/lib/coverage-gate.mjs';

function summary(path: string, lines: number, branches: number) {
  return {
    [path]: {
      lines: { pct: lines, covered: lines, total: 100 },
      branches: { pct: branches, covered: branches, total: 100 },
    },
  };
}

describe('per-file coverage gate', () => {
  it('rejects a critical file below 90 percent branches', () => {
    const failures = evaluateFileCoverage({
      criticalFiles: ['src/modules/whatsapp/whatsapp-event.ts'],
      modifiedFiles: [],
      summaries: summary(
        'C:/repo/src/modules/whatsapp/whatsapp-event.ts',
        99,
        89.99,
      ),
    });

    expect(failures).toEqual([
      'critical src/modules/whatsapp/whatsapp-event.ts: lines 99.00% / branches 89.99% (need ≥90/90)',
    ]);
  });

  it('rejects a modified non-critical file below 80 percent lines', () => {
    const failures = evaluateFileCoverage({
      criticalFiles: [],
      modifiedFiles: ['src/modules/auth/auth-service.ts'],
      summaries: summary('C:/repo/src/modules/auth/auth-service.ts', 79.99, 95),
    });

    expect(failures).toEqual([
      'modified src/modules/auth/auth-service.ts: lines 79.99% / branches 95.00% (need ≥80/80)',
    ]);
  });

  it('rejects a required file missing from the coverage report', () => {
    const failures = evaluateFileCoverage({
      criticalFiles: ['src/modules/orders/order-state.ts'],
      modifiedFiles: [],
      summaries: {},
    });

    expect(failures).toEqual([
      'critical src/modules/orders/order-state.ts: missing from coverage report',
    ]);
  });

  it('accepts exact per-file thresholds and does not double-check critical files', () => {
    const path = 'src/modules/orders/order-state.ts';
    const failures = evaluateFileCoverage({
      criticalFiles: [path],
      modifiedFiles: [path],
      summaries: summary(`C:/repo/${path}`, 90, 90),
    });

    expect(failures).toEqual([]);
  });
});
