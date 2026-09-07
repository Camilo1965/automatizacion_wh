import { describe, expect, it } from 'vitest';

import { advanceConversation } from '../src/modules/conversations/conversation-state.js';

describe('advanceConversation', () => {
  it('moves a first customer message to awaiting_size and queues the welcome', () => {
    expect(advanceConversation(null, 'hola')).toEqual({
      state: 'awaiting_size',
      reply: '¡Hola! 😊 ¿Qué talla buscas?',
    });
  });
});
