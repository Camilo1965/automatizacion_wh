import {
  advanceConfiguredConversation,
  renderFlowMessage,
} from './configured-flow.js';
import type { BotFlowDefinition } from './flow-definition.js';
import {
  formatOrderConfirmation,
  formatOrderReview,
} from './customer-order-messages.js';
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

type DemoFixture = {
  label: 'Ejemplo: no es un pedido real';
  orderNumber: 'PED-DEMO';
  reference: string;
  size: string;
  productName: string;
  productSubtotalCop: number;
  shippingCostCop: number;
  totalCop: number;
  carrier: string;
  address: string;
  locality: string;
  department: string;
  imageUrl: null;
};

export const BOT_FLOW_DEMO_FIXTURE: DemoFixture = {
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
};

function createDemoSummary(fixture: DemoFixture): OrderSummary {
  return {
    version: 1,
    draftVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    snapshot: {
      orderNumber: fixture.orderNumber,
      reference: { code: fixture.reference, modelName: fixture.productName },
      size: fixture.size,
      productSubtotalCop: fixture.productSubtotalCop,
      shippingCostCop: fixture.shippingCostCop,
      shippingPending: false,
      totalCop: fixture.totalCop,
      shippingQuote: { carrier: fixture.carrier, insuranceMode: 'none' },
      customer: { name: 'Cliente de ejemplo' },
      destination: {
        address: fixture.address,
        locality: fixture.locality,
        department: fixture.department,
      },
    },
  };
}

export function simulateBotFlow(
  definition: BotFlowDefinition,
  messages: readonly string[],
  scenario: SimulationScenario = 'available',
) {
  let state: ConversationState | null = null;
  let attempts = 0;
  let human = false;
  let expired = false;
  let outputFixture = BOT_FLOW_DEMO_FIXTURE;
  const money = (value: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  const variables = {
    talla: outputFixture.size,
    referencia: outputFixture.reference,
    nombre: 'Cliente de ejemplo',
    pedido: outputFixture.orderNumber,
    total: `$${money(outputFixture.totalCop)} COP`,
    transportadora: outputFixture.carrier,
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
          reply: `${scenario === 'fallback' ? 'La transportadora preferida no está disponible; se aplica la alternativa permitida.\n\n' : ''}${formatOrderReview(createDemoSummary(outputFixture), definition)}`,
        };
    }
    if (transition.action === 'confirm_order') {
      if (scenario === 'expired_quote' && !expired) {
        expired = true;
        const shippingCostCop = 20000;
        outputFixture = {
          ...outputFixture,
          shippingCostCop,
          totalCop: outputFixture.productSubtotalCop + shippingCostCop,
        };
        transition = {
          state: 'awaiting_confirmation',
          reply: `La cotización venció. Esta es la cotización actualizada; revísala y confirma de nuevo.\n\n${formatOrderReview(createDemoSummary(outputFixture), definition)}`,
        };
      } else
        transition = {
          ...transition,
          reply: formatOrderConfirmation(outputFixture.orderNumber),
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
    fixture: outputFixture,
    sideEffects: false as const,
  };
}
