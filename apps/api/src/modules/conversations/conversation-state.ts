export type ConversationState =
  | 'awaiting_size'
  | 'showing_models'
  | 'awaiting_name'
  | 'awaiting_phone'
  | 'awaiting_department'
  | 'awaiting_locality'
  | 'awaiting_address'
  | 'awaiting_notes'
  | 'awaiting_shipping'
  | 'awaiting_confirmation'
  | 'completed';

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
    | 'select_reference'
    | 'collect_name'
    | 'collect_phone'
    | 'collect_department'
    | 'collect_locality'
    | 'collect_address'
    | 'collect_notes'
    | 'select_shipping'
    | 'confirm_order'
    | 'cancel_order';
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
    (normalized === 'cancelar' && state !== 'awaiting_confirmation')
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
  const value = message.trim();
  if (state === 'awaiting_name') {
    return value.length >= 2 && value.length <= 120
      ? {
          state: 'awaiting_phone',
          reply:
            '¿Usamos el número de este WhatsApp? Responde “sí” o escribe otro celular.',
          action: 'collect_name',
          input: value,
        }
      : { state, reply: 'Escribe tu nombre completo.' };
  }
  if (state === 'awaiting_phone') {
    const digits = value.replace(/\D/g, '');
    return /^(?:57)?3\d{9}$/.test(digits) ||
      ['si', 'mismo', 'este'].includes(normalized)
      ? {
          state: 'awaiting_department',
          reply: '¿En qué departamento recibes el pedido?',
          action: 'collect_phone',
          input: /^(?:57)?3\d{9}$/.test(digits) ? value : '',
        }
      : {
          state,
          reply:
            'Responde “sí” para usar este WhatsApp o escribe un celular colombiano válido.',
        };
  }
  if (state === 'awaiting_department') {
    return value.length >= 3
      ? {
          state: 'awaiting_locality',
          reply: '¿En qué ciudad o municipio?',
          action: 'collect_department',
          input: value,
        }
      : { state, reply: 'Escribe el nombre del departamento.' };
  }
  if (state === 'awaiting_locality') {
    return value.length >= 2
      ? {
          state: 'awaiting_address',
          reply: null,
          action: 'collect_locality',
          input: value,
        }
      : { state, reply: 'Escribe la ciudad o municipio.' };
  }
  if (state === 'awaiting_address') {
    return value.length >= 5
      ? {
          state: 'awaiting_notes',
          reply:
            '¿Alguna indicación de entrega? Responde “no” o “saltar” si no aplica.',
          action: 'collect_address',
          input: value,
        }
      : { state, reply: 'Escribe una dirección más completa.' };
  }
  if (state === 'awaiting_notes') {
    return {
      state: 'awaiting_confirmation',
      reply: null,
      action: 'collect_notes',
      input: /^(ninguna|no|omitir|saltar|sin indicaciones)$/.test(normalized)
        ? ''
        : value,
    };
  }
  if (state === 'awaiting_shipping') {
    if (/^[12]$/.test(value)) {
      return {
        state: 'awaiting_confirmation',
        reply: null,
        action: 'select_shipping',
        input: value,
      };
    }
    return {
      state,
      reply: 'Responde 1 para envío económico o 2 para envío protegido.',
    };
  }
  if (state === 'awaiting_confirmation') {
    if (normalized === 'confirmar') {
      return { state: 'completed', reply: null, action: 'confirm_order' };
    }
    if (normalized === 'cancelar') {
      return {
        state: 'awaiting_size',
        reply: null,
        selectedSize: null,
        action: 'cancel_order',
      };
    }
    return {
      state,
      reply: 'Responde “confirmar” para reservar o “cancelar”.',
    };
  }
  if (state === 'completed') {
    return {
      state,
      reply:
        'Tu pedido ya fue confirmado. Escribe “asesora” si necesitas ayuda.',
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
