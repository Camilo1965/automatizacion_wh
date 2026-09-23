import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { ToastProvider } from '../components/ToastProvider';
import { ConversationInboxPage } from './ConversationInboxPage';

const conversationId = '11111111-1111-4111-8111-111111111111';
const secondConversationId = '33333333-3333-4333-8333-333333333333';

function conversationFixture(
  id: string,
  customerPhone: string,
  state = 'awaiting_size',
) {
  return {
    id,
    customerPhone,
    state,
    mode: 'human',
    selectedSize: null,
    activeOrderId: null,
    pendingOutbound: 0,
    lastInboundMessageAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
  };
}

describe('ConversationInboxPage', () => {
  it('shows the WhatsApp transcript and sends an owner reply', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    server.use(
      http.get('/api/admin/conversations', () =>
        HttpResponse.json({
          data: {
            items: [
              {
                id: conversationId,
                customerPhone: '+573001234567',
                state: 'awaiting_size',
                mode: 'human',
                selectedSize: null,
                activeOrderId: null,
                pendingOutbound: 0,
                lastInboundMessageAt: '2026-09-10T12:00:00.000Z',
                updatedAt: '2026-09-10T12:00:00.000Z',
              },
            ],
            nextCursor: null,
          },
        }),
      ),
      http.get(`/api/admin/conversations/${conversationId}/messages`, () =>
        HttpResponse.json({
          data: {
            items: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                conversationId,
                source: 'customer',
                messageType: 'text',
                text: 'Hola, busco talla 37',
                mediaUrl: null,
                status: 'received',
                providerMessageId: 'wamid.1',
                occurredAt: '2026-09-10T12:00:00.000Z',
              },
              {
                id: '44444444-4444-4444-8444-444444444444',
                conversationId,
                source: 'system',
                messageType: 'event',
                text: null,
                mediaUrl: null,
                status: 'internal',
                providerMessageId: null,
                occurredAt: '2026-09-10T12:01:00.000Z',
                orderId: '55555555-5555-4555-8555-555555555555',
                orderNumber: 'PED-000123',
                guideJobId: '66666666-6666-4666-8666-666666666666',
                preShipmentNumber: 'PRE-321',
                carrier: '99envíos',
              },
            ],
            nextCursor: null,
          },
        }),
      ),
      http.post(
        `/api/admin/conversations/${conversationId}/messages`,
        async ({ request }) => {
          sent = await request.json();
          return HttpResponse.json(
            { data: { id: 'outbound-1', status: 'queued' } },
            { status: 202 },
          );
        },
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <ConversationInboxPage />
      </ToastProvider>,
    );
    const timeline = await screen.findByRole('log', { name: 'Mensajes' });
    expect(within(timeline).getByText('Hola, busco talla 37')).toBeVisible();
    expect(within(timeline).getByText('Guía de envío creada')).toBeVisible();
    expect(
      within(timeline).getByText('Solo visible para el equipo de KAIRO'),
    ).toBeVisible();
    expect(within(timeline).queryByText(/· Interno/)).not.toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Responder por WhatsApp' }),
      'Sí, tenemos disponibilidad.',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(sent).toMatchObject({ text: 'Sí, tenemos disponibilidad.' });
    expect(await screen.findByText('Mensaje en cola')).toBeVisible();
  });

  it('keeps separate reply drafts when switching conversations', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/admin/conversations', () =>
        HttpResponse.json({
          data: {
            items: [
              conversationFixture(conversationId, '+573001234567'),
              conversationFixture(secondConversationId, '+573009876543'),
            ],
            nextCursor: null,
          },
        }),
      ),
      http.get('/api/admin/conversations/:conversationId/messages', () =>
        HttpResponse.json({ data: { items: [], nextCursor: null } }),
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <ConversationInboxPage />
      </ToastProvider>,
    );
    const textbox = await screen.findByRole('textbox', {
      name: 'Responder por WhatsApp',
    });
    await user.type(textbox, 'Mensaje para Ana');
    await user.click(screen.getByText('+573009876543'));
    expect(textbox).toHaveValue('');
    await user.type(textbox, 'Mensaje para Bea');
    await user.click(screen.getByText('+573001234567'));
    expect(textbox).toHaveValue('Mensaje para Ana');
    await user.click(screen.getByText('+573009876543'));
    expect(textbox).toHaveValue('Mensaje para Bea');
  });
});
