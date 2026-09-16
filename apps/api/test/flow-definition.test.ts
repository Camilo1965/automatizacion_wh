import { describe, expect, it } from 'vitest';

import {
  createDefaultBotFlow,
  validateBotFlow,
} from '../src/modules/conversations/flow-definition.js';

describe('guided bot flow definition', () => {
  it('rejects variables before their data exists and malformed placeholders', () => {
    const flow = createDefaultBotFlow();
    expect(
      validateBotFlow({
        ...flow,
        steps: {
          ...flow.steps,
          welcome: { enabled: true, message: 'Hola {{total}}' },
        },
      }),
    ).toContainEqual(expect.objectContaining({ code: 'unavailable_variable' }));
    expect(
      validateBotFlow({
        ...flow,
        steps: {
          ...flow.steps,
          summary: { enabled: true, message: 'Total {{total' },
        },
      }),
    ).toContainEqual(expect.objectContaining({ code: 'malformed_variable' }));
  });
  it('provides a valid Spanish default flow and prevents disabling its summary', () => {
    const flow = createDefaultBotFlow();
    expect(validateBotFlow(flow)).toEqual([]);
    expect(
      validateBotFlow({
        ...flow,
        steps: {
          ...flow.steps,
          summary: { ...flow.steps.summary, enabled: false },
        },
      }),
    ).toContainEqual(
      expect.objectContaining({ code: 'required_step_disabled' }),
    );
  });
});
