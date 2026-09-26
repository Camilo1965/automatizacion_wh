import {
  advanceConfiguredConversation,
  renderFlowMessage,
} from './configured-flow.js';
import type { BotFlowDefinition } from './flow-definition.js';
import { formatOrderReview } from './customer-order-messages.js';
import type { OrderSummary } from '../orders/order-types.js';
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

export const BOT_FLOW_DEMO_FIXTURE = {
  label: 'Ejemplo: no es un pedido real',
  orderNumber: 'PED-DEMO',
  reference: '01',
  size: '37',
  productName: 'Tenis de ejemplo',
  productSubtotalCop: 120000,
  shippingCostCop: 18000,
  totalCop: 138000,
  carrier: 'Envia',
  address: 'Calle 10 # 20-30',
  locality: 'Medellín',
  department: 'Antioquia',
  imageUrl: null,
} as const;

export function simulateBotFlow(
  definition: BotFlowDefinition,
  messages: readonly string[],
  scenario: SimulationScenario = 'available',
) {
  let state: ConversationState | null = null;
  let attempts = 0;
  let human = false;
  let expired = false;
  const money = (value: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  const variables = {
    talla: BOT_FLOW_DEMO_FIXTURE.size,
    referencia: BOT_FLOW_DEMO_FIXTURE.reference,
    nombre: 'Cliente de ejemplo',
    pedido: BOT_FLOW_DEMO_FIXTURE.orderNumber,
    total: `$${money(BOT_FLOW_DEMO_FIXTURE.totalCop)} COP`,
    transportadora: 'Envia',
  };
  const demoSummary: OrderSummary = {
    version: 1,
    draftVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    snapshot: {
      orderNumber: variables.pedido,
      reference: {
        code: variables.referencia,
        modelName: BOT_FLOW_DEMO_FIXTURE.productName,
      },
      size: variables.talla,
      productSubtotalCop: BOT_FLOW_DEMO_FIXTURE.productSubtotalCop,
      shippingCostCop: BOT_FLOW_DEMO_FIXTURE.shippingCostCop,
      shippingPending: false,
      totalCop: BOT_FLOW_DEMO_FIXTURE.totalCop,
      shippingQuote: {
        carrier: BOT_FLOW_DEMO_FIXTURE.carrier,
        insuranceMode: 'none',
      },
      customer: { name: variables.nombre },
      destination: {
        address: BOT_FLOW_DEMO_FIXTURE.address,
        locality: BOT_FLOW_DEMO_FIXTURE.locality,
        department: BOT_FLOW_DEMO_FIXTURE.department,
      },
    },
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
          reply: `${scenario === 'fallback' ? 'La transportadora preferida no está disponible; se aplica la alternativa permitida.\n\n' : ''}${formatOrderReview(demoSummary, definition)}`,
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
  return {
    events,
    fixture: BOT_FLOW_DEMO_FIXTURE,
    sideEffects: false as const,
  };
}
