import { describe, expect, it } from 'vitest';

import {
  copyGlobalForMunicipality,
  DEFAULT_POLICY,
  describePolicy,
  policyValidationMessage,
} from './policy-utils';

describe('municipal shipping policy helpers', () => {
  it('copies a complete policy without copying the global revision', () => {
    const global = {
      ...DEFAULT_POLICY,
      revision: 7,
      preferredCarrier: 'tcc',
      fallbackPolicy: 'block' as const,
      allowedCarriers: ['tcc'],
      packageDefaults: {
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
      },
    };
    const municipal = copyGlobalForMunicipality(global);
    expect(municipal).toMatchObject({
      revision: 0,
      preferredCarrier: 'tcc',
      allowedCarriers: ['tcc'],
      packageDefaults: { weightKg: 1 },
    });
    expect(municipal.allowedCarriers).not.toBe(global.allowedCarriers);
    expect(municipal.packageDefaults).not.toBe(global.packageDefaults);
    expect(describePolicy(municipal)).toMatch(/solo TCC está permitida/i);
  });

  it.each([
    [
      'empty allowed list',
      { allowedCarriers: [] },
      /al menos una transportadora permitida/i,
    ],
    [
      'preferred excluded',
      { preferredCarrier: 'tcc', excludedCarriers: ['tcc'] },
      /transportadora preferida TCC está excluida/i,
    ],
    [
      'secondary excluded',
      { orderedCarriers: ['envia'], excludedCarriers: ['envia'] },
      /transportadora secundaria Envia está excluida/i,
    ],
  ] as const)('names the conflict for %s', (_name, changes, message) => {
    expect(policyValidationMessage({ ...DEFAULT_POLICY, ...changes })).toMatch(
      message,
    );
  });
});
