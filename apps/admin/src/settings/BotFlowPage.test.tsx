import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotFlowStepKeys } from '@camila/contracts';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { BotFlowPage } from './BotFlowPage';

const definition = {
  commands: {
    human: 'humano',
    reset: 'reiniciar',
    more: 'mas',
    confirm: 'confirmar',
    cancel: 'cancelar',
  },
  pageSize: 3,
  steps: Object.fromEntries(
    BotFlowStepKeys.map((key) => [
      key,
      { enabled: true, message: `Paso ${key}` },
    ]),
  ),
  optionalSteps: {
    notes: true,
    showCarrierInSummary: true,
    sendGuideToCustomer: true,
  },
};

const simulationFixture = {
  label: 'Ejemplo: no es un pedido real' as const,
  orderNumber: 'PED-DEMO' as const,
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

describe('BotFlowPage editing and simulation', () => {
  beforeEach(() => sessionStorage.removeItem('kairo.bot-flow-draft'));

  it('explains the fixed two-error handoff without an editable attempts control', async () => {
    const legacyDefinition = {
      ...definition,
      steps: {
        ...definition.steps,
        size: { enabled: true, message: 'Talla', maxAttempts: 7 },
      },
    };
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition: legacyDefinition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<BotFlowPage />);
    expect(await screen.findByText('Borrador guardado')).toBeVisible();
    expect(screen.getByLabelText('Cambiar dirección')).toBeVisible();
    expect(screen.getByLabelText('Cambiar municipio')).toBeVisible();
    expect(screen.getByLabelText('Cambiar producto')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '2. Talla' }));
    expect(screen.getByText(/dos respuestas no válidas/i)).toBeVisible();
    expect(
      screen.queryByLabelText('Intentos antes de solicitar atención humana'),
    ).toBeNull();
  });

  it('explains that the owner edits the header and question while order details are calculated', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
    );
    renderWithProviders(<BotFlowPage />);
    expect(await screen.findByText('Borrador guardado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '12. Resumen' }));
    expect(
      screen.getByText(/Este texto es el encabezado opcional/i),
    ).toBeVisible();
    expect(
      screen.getByText(/Los datos del pedido, envío y total se calculan/i),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '13. Confirmación' }));
    expect(screen.getByText(/Escribe una sola pregunta/i)).toBeVisible();
  });

  it('keeps persistent optional-step controls in Editor, not Simular', async () => {
    const user = userEvent.setup();
    let simulatedNotes: boolean | undefined;
    let draftWrites = 0;
    let savedGuidePolicy: boolean | undefined;
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
      http.put('/api/admin/bot-flow/draft', async ({ request }) => {
        draftWrites += 1;
        const body = (await request.json()) as {
          definition: typeof definition;
        };
        savedGuidePolicy = body.definition.optionalSteps.sendGuideToCustomer;
        return HttpResponse.json({
          data: {
            revision: 2,
            definition: body.definition,
            activeVersionId: null,
            versions: [],
          },
        });
      }),
      http.post('/api/admin/bot-flow/simulate', async ({ request }) => {
        simulatedNotes = (
          (await request.json()) as { definition: typeof definition }
        ).definition.optionalSteps.notes;
        return HttpResponse.json({
          data: {
            events: [],
            fixture: simulationFixture,
            sideEffects: false,
          },
        });
      }),
    );
    renderWithProviders(<BotFlowPage />);

    expect(await screen.findByText('Borrador guardado')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Simular' }));
    expect(screen.queryByRole('switch')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Editor' }));
    await user.click(
      screen.getByRole('switch', {
        name: 'Solicitar indicaciones de entrega',
      }),
    );
    expect(screen.getByText('Cambios sin guardar')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(draftWrites).toBe(1));
    expect(savedGuidePolicy).toBe(false);
    await user.click(screen.getByRole('tab', { name: 'Simular' }));
    await user.click(screen.getByText('Pruebas avanzadas'));
    await user.click(
      screen.getByRole('button', { name: 'Probar mensajes avanzados' }),
    );
    expect(simulatedNotes).toBe(false);
    expect(draftWrites).toBe(1);
  });

  it('shows operator-only guide delivery and does not expose customer sending as an active option', async () => {
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
    );
    renderWithProviders(<BotFlowPage />);

    expect(await screen.findByText('Borrador guardado')).toBeVisible();
    expect(screen.getByText('Guía para el operador')).toBeVisible();
    expect(
      screen.getByText(/Descarga disponible en la conversación/),
    ).toBeVisible();
    expect(
      screen.queryByRole('switch', {
        name: 'Enviar la guía como PDF al cliente',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Envío al cliente: próximamente/)).toBeVisible();
  });

  it('starts a fake customer chat from a scenario, accepts keyboard replies, and keeps advanced input optional', async () => {
    const calls: { scenario: string; messages: string[] }[] = [];
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
      http.post('/api/admin/bot-flow/simulate', async ({ request }) => {
        const body = (await request.json()) as {
          scenario: string;
          messages: string[];
        };
        calls.push(body);
        return HttpResponse.json({
          data: {
            fixture: {
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
            },
            events: body.messages.map((input, index) => ({
              input,
              state: index === 0 ? 'awaiting_size' : 'showing_models',
              reply: index === 0 ? '¡Hola! ¿Qué talla buscas?' : null,
              action: index === 0 ? null : 'show_catalog',
            })),
            sideEffects: false,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BotFlowPage />);
    await user.click(await screen.findByRole('tab', { name: 'Simular' }));

    await user.click(screen.getByRole('button', { name: 'Compra disponible' }));
    expect(
      await screen.findByText('Ejemplo: no es un pedido real'),
    ).toBeVisible();
    expect(screen.getByText(/Tenis de ejemplo/)).toBeVisible();
    expect(
      screen.getByRole('log', { name: 'Conversación simulada' }),
    ).toBeVisible();
    expect(calls.at(-1)?.messages).toEqual([
      'hola',
      '37',
      '01',
      'Ana Ejemplo',
      '3000000000',
      'Antioquia',
      'Medellín',
      'Calle 10 # 20-30',
      'ninguna',
      'confirmar',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Conversación paso a paso' }),
    );
    const response = screen.getByRole('textbox', {
      name: 'Respuesta del cliente',
    });
    await user.type(response, '37{Enter}');
    expect(calls.at(-1)?.messages).toEqual(['hola', '37']);
    expect(response).toHaveFocus();

    expect(
      screen.getByLabelText('Mensajes para pruebas avanzadas'),
    ).not.toBeVisible();
    await user.click(screen.getByText('Pruebas avanzadas'));
    expect(
      screen.getByLabelText('Mensajes para pruebas avanzadas'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Probar mensajes avanzados' }),
    ).toBeVisible();
  });

  it('offers all six scenario controls and resets the conversation without a request', async () => {
    let simulationCalls = 0;
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
      http.post('/api/admin/bot-flow/simulate', () => {
        simulationCalls += 1;
        return HttpResponse.json({
          data: {
            events: [],
            fixture: simulationFixture,
            sideEffects: false,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BotFlowPage />);
    await user.click(await screen.findByRole('tab', { name: 'Simular' }));

    expect(
      screen.getByRole('button', { name: 'Compra disponible' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Talla agotada' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Municipio inválido' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Transportadora bloqueada' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Alternativa permitida' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Cotización vencida' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Compra disponible' }));
    expect(
      await screen.findByRole('button', { name: 'Reiniciar simulación' }),
    ).toBeVisible();
    const callsBeforeReset = simulationCalls;
    await user.click(
      screen.getByRole('button', { name: 'Reiniciar simulación' }),
    );
    expect(
      screen.queryByRole('log', { name: 'Conversación simulada' }),
    ).toBeNull();
    expect(simulationCalls).toBe(callsBeforeReset);
  });
});
