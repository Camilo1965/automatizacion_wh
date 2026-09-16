import {
  advanceConfiguredConversation,
  renderFlowMessage,
} from './configured-flow.js';
import type { BotFlowDefinition } from './flow-definition.js';
import type {
  ConversationState,
  ConversationTransition,
} from './conversation-state.js';

export type SimulationScenario =
  | 'available'
  | 'out_of_stock'
  | 'invalid_locality'
  | 'blocked_carrier'
  | 'fallback'
  | 'expired_quote';
export function simulateBotFlow(
  definition: BotFlowDefinition,
  messages: readonly string[],
  scenario: SimulationScenario = 'available',
) {
  let state: ConversationState | null = null;
  let attempts = 0;
  let human = false;
  let expired = false;
  const variables = {
    talla: '37',
    referencia: '01',
    nombre: 'Cliente de prueba',
    pedido: 'PED-DEMO',
    total: '$138.000',
    transportadora: 'Envia',
  };
  const events = messages.map((input) => {
    let transition: ConversationTransition = human
      ? {
          state: state ?? 'awaiting_size',
          reply: 'La propietaria debe continuar la conversación.',
          action: 'human_takeover',
        }
      : advanceConfiguredConversation(state, input, attempts, definition);
    if (transition.action === 'show_catalog')
      transition =
        scenario === 'out_of_stock'
          ? {
              state: 'awaiting_size',
              reply:
                'No hay modelos disponibles en esta talla. Prueba otra talla.',
            }
          : {
              ...transition,
              reply: `${definition.steps.catalog.message}\n${definition.steps.reference.message}`,
            };
    if (transition.action === 'select_reference')
      transition = {
        ...transition,
        state: 'awaiting_name',
        reply: definition.steps.name.message,
      };
    if (transition.action === 'collect_locality')
      transition =
        scenario === 'invalid_locality'
          ? {
              state: 'awaiting_locality',
              reply:
                'No encontramos el municipio en el departamento seleccionado. Confirma el nombre.',
            }
          : { ...transition, reply: definition.steps.address.message };
    if (
      transition.action === 'collect_notes' ||
      (transition.action === 'collect_address' &&
        !definition.optionalSteps.notes)
    ) {
      if (scenario === 'blocked_carrier') {
        human = true;
        transition = {
          state: 'awaiting_confirmation',
          reply:
            'La transportadora obligatoria no está disponible. La propietaria revisará el envío; no se genera guía.',
          action: 'human_takeover',
        };
      } else
        transition = {
          ...transition,
          reply: `${scenario === 'fallback' ? 'La transportadora preferida no está disponible; se aplica la alternativa permitida.\n' : ''}${definition.steps.summary.message}\n${definition.steps.confirmation.message}`,
        };
    }
    if (transition.action === 'confirm_order') {
      if (scenario === 'expired_quote' && !expired) {
        expired = true;
        transition = {
          state: 'awaiting_confirmation',
          reply:
            'La cotización venció. Se recalcula el envío y debes confirmar nuevamente el resumen.',
        };
      } else
        transition = {
          ...transition,
          reply: definition.steps.complete.message,
        };
    }
    if (transition.action === 'human_takeover') human = true;
    state = transition.state;
    attempts = transition.invalidAttempts ?? 0;
    return {
      input,
      state,
      reply:
        transition.reply === null
          ? null
          : renderFlowMessage(transition.reply, variables),
      action: transition.action ?? null,
    };
  });
  return { events, sideEffects: false as const };
}
