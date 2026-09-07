export type ConversationState = 'awaiting_size' | 'showing_models';

export type ConversationTransition = Readonly<{
  state: ConversationState;
  reply: string | null;
  selectedSize?: string | null;
  invalidAttempts?: number;
  action?:
    | 'show_catalog'
    | 'reset'
    | 'human_takeover'
    | 'more_models'
    | 'select_reference';
  input?: string;
}>;

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseSize(message: string): string | null {
  const normalized = message.trim().replace(',', '.');
  if (!/^\d{1,2}(?:\.5)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (value < 1 || value > 99.5) return null;
  return value.toFixed(1);
}

export function advanceConversation(
  state: ConversationState | null,
  message: string,
  invalidAttempts = 0,
): ConversationTransition {
  if (state === null) {
    return {
      state: 'awaiting_size',
      reply: '¡Hola! 😊 ¿Qué talla buscas?',
    };
  }
  const normalized = normalizeMessage(message);
  if (normalized === 'asesora' || normalized === 'asesor') {
    return {
      state,
      reply: 'Listo. La propietaria continuará la conversación contigo.',
      action: 'human_takeover',
    };
  }
  if (
    normalized === 'volver' ||
    normalized === 'cambiar talla' ||
    normalized === 'cancelar'
  ) {
    return {
      state: 'awaiting_size',
      reply: 'Claro. ¿Qué talla buscas?',
      selectedSize: null,
      invalidAttempts: 0,
      action: 'reset',
    };
  }
  if (state === 'awaiting_size') {
    const selectedSize = parseSize(message);
    if (selectedSize !== null) {
      return {
        state: 'showing_models',
        reply: null,
        selectedSize,
        action: 'show_catalog',
      };
    }
    const nextAttempts = invalidAttempts + 1;
    return {
      state,
      reply:
        nextAttempts >= 2
          ? 'No pude reconocer la talla. Escribe una talla como 37 o escribe “asesora”.'
          : 'Escribe la talla en números, por ejemplo 37 o 37.5.',
      invalidAttempts: nextAttempts,
    };
  }
  if (normalized === 'mas modelos' || normalized === 'mas') {
    return { state, reply: null, action: 'more_models' };
  }
  if (normalized !== '') {
    return {
      state,
      reply: null,
      action: 'select_reference',
      input: message.trim().toUpperCase(),
    };
  }
  return {
    state,
    reply:
      'Escribe la referencia que te gustó, “más modelos” o “cambiar talla”.',
  };
}
