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
  it('shows the same priced review shape as the real customer message', () => {
    const flow = createDefaultBotFlow();
    flow.steps.summary = {
      enabled: true,
      message: '¡Revisa tu compra!\nPrecio sugerido 95.000 COP',
    };
    const reply = simulateBotFlow(flow, messages).events.find(
      (event) => event.action === 'collect_notes',
    )?.reply;
    expect(reply).toContain('¡Revisa tu compra!');
    expect(reply).toContain('Pedido PED-DEMO');
    expect(reply).toContain('Total contra entrega: $138.000 COP');
    expect(reply).not.toContain('95.000 COP');
    expect(reply?.match(/¿Confirmas/g)).toHaveLength(1);
  });

  it('marks its fixed order as fictitious and keeps the shared review text exact', () => {
    const result = simulateBotFlow(createDefaultBotFlow(), messages);
    const review = result.events.find(
      (event) => event.action === 'collect_notes',
    );

    expect(result).toMatchObject({
      sideEffects: false,
      fixture: {
        label: 'Ejemplo: no es un pedido real',
        orderNumber: 'PED-DEMO',
        reference: '01',
        size: '37',
        productName: 'Tenis de ejemplo',
        productSubtotalCop: 120000,
        shippingCostCop: 18000,
        totalCop: 138000,
        imageUrl: null,
      },
    });
    expect(review?.reply).toBe(
      'Revisa el resumen de tu pedido.\n\n' +
        'Pedido PED-DEMO\n' +
        'REF 01 · Tenis de ejemplo\n' +
        'Talla 37\n' +
        'Productos: $120.000 COP\n' +
        'Envío (Envia): $18.000 COP\n' +
        'Total contra entrega: $138.000 COP\n' +
        'Cliente: Cliente de ejemplo\n' +
        'Dirección: Calle 10 # 20-30\n' +
        'Medellín, Antioquia\n\n' +
        '¿Confirmas tu pedido para reservarlo?\n' +
        '• confirmar\n' +
        '• cancelar\n' +
        '• cambiar dirección\n' +
        '• cambiar municipio\n' +
        '• cambiar producto',
    );
  });

  it.each([
    ['out_of_stock', 'No hay modelos disponibles'],
    ['invalid_locality', 'No encontramos el municipio'],
    ['blocked_carrier', 'no se genera guía'],
    ['expired_quote', 'La cotización venció'],
  ] as const)(
    'does not claim an order confirmation for blocked scenario %s',
    (scenario, expectedText) => {
      const result = simulateBotFlow(
        createDefaultBotFlow(),
        messages,
        scenario,
      );

      expect(result.sideEffects).toBe(false);
      expect(
        result.events.some((event) => event.reply?.includes(expectedText)),
      ).toBe(true);
      expect(
        result.events.some((event) =>
          event.reply?.includes('Tu pedido quedó confirmado'),
        ),
      ).toBe(false);
    },
  );

  it('labels an allowed carrier alternative without claiming dispatch', () => {
    const result = simulateBotFlow(
      createDefaultBotFlow(),
      messages,
      'fallback',
    );
    const review = result.events.find(
      (event) => event.action === 'collect_notes',
    );

    expect(review?.reply).toContain('se aplica la alternativa permitida');
    expect(review?.reply).toContain('Pedido PED-DEMO');
    expect(review?.reply).not.toMatch(/despachado|entregado/i);
  });
});
