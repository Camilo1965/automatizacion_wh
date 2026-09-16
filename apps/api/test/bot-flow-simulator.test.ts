import { describe, expect, it } from 'vitest';
import { simulateBotFlow } from '../src/modules/conversations/bot-flow-simulator.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';

describe('isolated bot simulation', () => {
  const messages = [
    'hola',
    '37',
    '01',
    'Ana Perez',
    '3001234567',
    'Antioquia',
    'Medellín',
    'Calle 10 número 20',
    'ninguna',
    'confirmar',
  ];
  it('blocks unavailable inventory before asking for customer data', () => {
    const result = simulateBotFlow(
      createDefaultBotFlow(),
      messages,
      'out_of_stock',
    );
    expect(result.sideEffects).toBe(false);
    expect(result.events[2]?.state).not.toBe('awaiting_name');
  });
  it('requires a fresh confirmation after an expired quote', () => {
    const result = simulateBotFlow(
      createDefaultBotFlow(),
      messages,
      'expired_quote',
    );
    expect(result.events.at(-1)?.state).toBe('awaiting_confirmation');
    expect(result.events.at(-1)?.reply).toContain('venció');
  });
  it('stops the simulation for a blocked carrier and explains fallback', () => {
    expect(
      simulateBotFlow(
        createDefaultBotFlow(),
        messages,
        'blocked_carrier',
      ).events.at(-1)?.action,
    ).toBe('human_takeover');
    expect(
      simulateBotFlow(createDefaultBotFlow(), messages, 'fallback').events.some(
        (event) => event.reply?.includes('alternativa'),
      ),
    ).toBe(true);
  });
});
