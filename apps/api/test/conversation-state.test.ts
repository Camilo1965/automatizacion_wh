import { describe, expect, it } from 'vitest';

import { advanceConversation } from '../src/modules/conversations/conversation-state.js';

describe('advanceConversation', () => {
  it('moves a first customer message to awaiting_size and queues the welcome', () => {
    expect(advanceConversation(null, 'hola')).toEqual({
      state: 'awaiting_size',
      reply: '¡Hola! 😊 ¿Qué talla buscas?',
    });
  });

  it.each([
    ['37', '37.0'],
    ['37.5', '37.5'],
    ['37,5', '37.5'],
  ])('accepts supported whole and half sizes: %s', (input, size) => {
    expect(advanceConversation('awaiting_size', input)).toEqual({
      state: 'showing_models',
      reply: null,
      selectedSize: size,
      action: 'show_catalog',
    });
  });

  it('rejects malformed sizes and offers an adviser after two failures', () => {
    expect(advanceConversation('awaiting_size', 'treinta y siete', 0)).toEqual({
      state: 'awaiting_size',
      reply: 'Escribe la talla en números, por ejemplo 37 o 37.5.',
      invalidAttempts: 1,
    });
    expect(advanceConversation('awaiting_size', '100', 1)).toEqual({
      state: 'awaiting_size',
      reply:
        'No pude reconocer la talla. Escribe una talla como 37 o escribe “asesora”.',
      invalidAttempts: 2,
    });
  });

  it.each(['volver', 'cambiar talla', 'cancelar'])(
    'returns to size selection for command %s',
    (command) => {
      expect(advanceConversation('showing_models', command)).toMatchObject({
        state: 'awaiting_size',
        selectedSize: null,
        action: 'reset',
      });
    },
  );

  it('requests human control with the asesora command', () => {
    expect(advanceConversation('awaiting_size', 'ASESORA')).toMatchObject({
      state: 'awaiting_size',
      action: 'human_takeover',
    });
  });

  it('recognizes catalog paging and reference selection', () => {
    expect(advanceConversation('showing_models', 'más modelos')).toMatchObject({
      action: 'more_models',
      reply: null,
    });
    expect(advanceConversation('showing_models', 'ref 01')).toMatchObject({
      action: 'select_reference',
      input: 'REF 01',
      reply: null,
    });
  });

  it('collects delivery fields and requires explicit confirmation', () => {
    expect(advanceConversation('awaiting_name', 'Camila Pérez')).toMatchObject({
      state: 'awaiting_phone',
      action: 'collect_name',
      input: 'Camila Pérez',
    });
    expect(advanceConversation('awaiting_phone', '315 819 1776')).toMatchObject(
      {
        state: 'awaiting_department',
        action: 'collect_phone',
        input: '315 819 1776',
      },
    );
    expect(
      advanceConversation('awaiting_confirmation', 'confirmar'),
    ).toMatchObject({
      state: 'completed',
      action: 'confirm_order',
    });
  });

  it('accepts only a numbered shipping option before confirmation', () => {
    expect(advanceConversation('awaiting_shipping', '2')).toMatchObject({
      state: 'awaiting_confirmation',
      action: 'select_shipping',
      input: '2',
    });
    const invalid = advanceConversation('awaiting_shipping', 'protegido');
    expect(invalid).toMatchObject({ state: 'awaiting_shipping' });
    expect(invalid).not.toHaveProperty('action');
  });

  it('keeps completed conversations from mutating on free text', () => {
    const result = advanceConversation('completed', 'hola otra vez');
    expect(result.state).toBe('completed');
    expect(result).not.toHaveProperty('action');
  });
});
