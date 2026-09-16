import { describe, expect, it } from 'vitest';

import {
  createDefaultBotFlow,
  validateBotFlow,
} from '../src/modules/conversations/flow-definition.js';

describe('guided bot flow definition', () => {
  it('provides a valid Spanish default flow and prevents disabling its summary', () => {
    const flow = createDefaultBotFlow();
    expect(validateBotFlow(flow)).toEqual([]);
    expect(
      validateBotFlow({
        ...flow,
        steps: { ...flow.steps, summary: { ...flow.steps.summary, enabled: false } },
      }),
    ).toContainEqual(expect.objectContaining({ code: 'required_step_disabled' }));
  });
});
