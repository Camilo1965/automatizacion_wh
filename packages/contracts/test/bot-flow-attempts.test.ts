import { describe, expect, it } from 'vitest';

import { BotFlowDefinitionSchema, BotFlowStepKeys } from '../src/bot-flow.js';

describe('bot flow attempt policy', () => {
  it('accepts a legacy saved attempt value but removes it from the editable definition', () => {
    const parsed = BotFlowDefinitionSchema.parse({
      commands: {
        human: 'asesora',
        reset: 'reiniciar',
        more: 'más modelos',
        confirm: 'confirmar',
        cancel: 'cancelar',
      },
      pageSize: 3,
      steps: Object.fromEntries(
        BotFlowStepKeys.map((key) => [
          key,
          { enabled: true, message: key, maxAttempts: 7 },
        ]),
      ),
      optionalSteps: {
        notes: true,
        showCarrierInSummary: true,
        sendGuideToCustomer: false,
      },
    });
    expect(parsed.steps.size).not.toHaveProperty('maxAttempts');
    expect(parsed.steps.locality).not.toHaveProperty('maxAttempts');
  });
});
