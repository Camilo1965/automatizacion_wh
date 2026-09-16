import { describe, expect, it } from 'vitest';
import { advanceConfiguredConversation } from '../src/modules/conversations/configured-flow.js';
import {
  createDefaultBotFlow,
  validateBotFlow,
} from '../src/modules/conversations/flow-definition.js';

describe('configurable flow', () => {
  it('renders the newly collected customer name in the next prompt', () => {
    const flow = createDefaultBotFlow();
    flow.steps.phone = {
      enabled: true,
      message: 'Gracias {{nombre}}, comparte tu celular.',
    };
    expect(
      advanceConfiguredConversation('awaiting_name', 'Ana Pérez', 0, flow)
        .reply,
    ).toBe('Gracias Ana Pérez, comparte tu celular.');
  });
  it('uses the published welcome and configurable commands without changing actions', () => {
    const flow = createDefaultBotFlow();
    flow.steps.welcome = {
      enabled: true,
      message: 'Bienvenida a nuestra tienda',
    };
    const custom = {
      ...flow,
      commands: { ...flow.commands, human: 'ayuda', confirm: 'comprar' },
    };
    expect(advanceConfiguredConversation(null, 'hola', 0, custom).reply).toBe(
      'Bienvenida a nuestra tienda',
    );
    expect(
      advanceConfiguredConversation('showing_models', 'ayuda', 0, custom)
        .action,
    ).toBe('human_takeover');
    expect(
      advanceConfiguredConversation(
        'awaiting_confirmation',
        'comprar',
        0,
        custom,
      ).action,
    ).toBe('confirm_order');
  });
  it('rejects unknown template variables and invalid attempts', () => {
    const flow = createDefaultBotFlow();
    flow.steps.size = {
      enabled: true,
      message: '{{password}}',
      maxAttempts: 0,
    };
    expect(validateBotFlow(flow).map((issue) => issue.code)).toContain(
      'unknown_variable',
    );
    expect(validateBotFlow(flow).map((issue) => issue.code)).toContain(
      'invalid_attempts',
    );
  });
  it('normalizes accents when validating command collisions', () => {
    const flow = createDefaultBotFlow();
    expect(
      validateBotFlow({
        ...flow,
        commands: { ...flow.commands, human: 'mas', more: 'más' },
      }).map((issue) => issue.code),
    ).toContain('invalid_commands');
  });
});
