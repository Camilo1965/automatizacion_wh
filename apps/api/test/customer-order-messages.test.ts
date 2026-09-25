import { describe, expect, it } from 'vitest';

import { formatOrderReview } from '../src/modules/conversations/customer-order-messages.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';
import type { OrderSummary } from '../src/modules/orders/order-types.js';

const summary: OrderSummary = {
  version: 1,
  draftVersion: 1,
  createdAt: new Date('2026-09-24T12:00:00.000Z'),
  snapshot: {
    orderNumber: 'PED-000123',
    reference: { code: '01', modelName: 'Tenis Camila', color: 'Negro' },
    size: '37.0',
    productSubtotalCop: 120000,
    shippingCostCop: 16968,
    shippingPending: false,
    totalCop: 136968,
    shippingQuote: { carrier: 'envia', insuranceMode: 'none' },
    customer: { name: 'Camila Pérez' },
    destination: {
      address: 'Calle 1 # 2-3',
      locality: 'Medellín',
      department: 'Antioquia',
    },
  },
};

describe('customer order review', () => {
  it('drops configured prices from the header and question while keeping the real total once', () => {
    const flow = createDefaultBotFlow();
    flow.steps.summary = {
      enabled: true,
      message:
        'Revisa tu compra.\nPrecio sugerido 95.000 COP\nPromo COP 95,000\nOferta $95.000',
    };
    flow.steps.confirmation = {
      enabled: true,
      message: '¿Confirmas por 95.000 COP?',
    };
    const body = formatOrderReview(summary, flow);
    expect(body).toContain('Revisa tu compra.');
    expect(body).toContain('Total contra entrega: $136.968 COP');
    expect(body.match(/Total contra entrega:/g)).toHaveLength(1);
    expect(body).not.toMatch(/95[.,]000/);
    expect(body).toContain('¿Confirmas tu pedido para reservarlo?');
  });

  it('rejects formatted price examples even when the currency is omitted', () => {
    const flow = createDefaultBotFlow();
    flow.steps.summary = {
      enabled: true,
      message: 'Revisa tu compra.\nOferta 95.000',
    };
    flow.steps.confirmation = {
      enabled: true,
      message: '¿Confirmas por 95.000?',
    };
    const body = formatOrderReview(summary, flow);
    expect(body).not.toContain('95.000');
    expect(body).toContain('¿Confirmas tu pedido para reservarlo?');
  });

  it('rejects unformatted five-digit example prices', () => {
    const flow = createDefaultBotFlow();
    flow.steps.summary = {
      enabled: true,
      message: 'Revisa tu compra.\nPrecio 95000',
    };
    flow.steps.confirmation = {
      enabled: true,
      message: '¿Confirmas por 95000?',
    };
    const body = formatOrderReview(summary, flow);
    expect(body).not.toContain('95000');
    expect(body).toContain('¿Confirmas tu pedido para reservarlo?');
  });

  it('hides the selected carrier from both operational text and configured placeholders', () => {
    const defaultFlow = createDefaultBotFlow();
    const flow = {
      ...defaultFlow,
      steps: {
        ...defaultFlow.steps,
        summary: {
          enabled: true,
          message: 'Tu pedido viaja por {{transportadora}}.',
        },
        confirmation: {
          enabled: true,
          message: '¿Aceptas el envío por {{transportadora}}?',
        },
      },
      optionalSteps: {
        ...defaultFlow.optionalSteps,
        showCarrierInSummary: false,
      },
    };
    const body = formatOrderReview(summary, flow);
    expect(body).not.toContain('envia');
    expect(body).toContain('Envío: $16.968 COP');
  });
});
