import { describe, expect, it } from 'vitest';

import {
  createDefaultBotFlow,
  normalizeBotFlowForOperatorOnly,
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
    expect(flow.steps.summary.message).toBe('Revisa el resumen de tu pedido.');
    expect(flow.steps.confirmation.message).toBe(
      '¿Confirmas tu pedido para reservarlo?',
    );
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

  it('defaults guide delivery to the operator-only MVP policy', () => {
    expect(createDefaultBotFlow().optionalSteps.sendGuideToCustomer).toBe(
      false,
    );
  });

  it('normalizes a copied flow without mutating a historical opt-in definition', () => {
    const historical = {
      ...createDefaultBotFlow(),
      optionalSteps: {
        ...createDefaultBotFlow().optionalSteps,
        sendGuideToCustomer: true,
      },
    };

    const normalized = normalizeBotFlowForOperatorOnly(historical);

    expect(normalized.optionalSteps.sendGuideToCustomer).toBe(false);
    expect(historical.optionalSteps.sendGuideToCustomer).toBe(true);
    expect(normalized.steps).toBe(historical.steps);
  });
});
