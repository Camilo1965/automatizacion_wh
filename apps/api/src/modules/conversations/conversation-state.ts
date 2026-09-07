export type ConversationState = 'awaiting_size' | 'showing_models';

export type ConversationTransition = Readonly<{
  state: ConversationState;
  reply: string;
}>;

export function advanceConversation(
  state: ConversationState | null,
  _message: string,
): ConversationTransition {
  if (state === null) {
    return {
      state: 'awaiting_size',
      reply: '¡Hola! 😊 ¿Qué talla buscas?',
    };
  }
  return { state, reply: '¿Qué talla buscas?' };
}
