import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { ToastProvider } from '../components/ToastProvider';
import { ConversationInboxPage } from './ConversationInboxPage';

const conversationId = '11111111-1111-4111-8111-111111111111';

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
    await user.type(
      screen.getByRole('textbox', { name: 'Responder por WhatsApp' }),
      'Sí, tenemos disponibilidad.',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(sent).toMatchObject({ text: 'Sí, tenemos disponibilidad.' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Mensaje en cola',
    );
  });
});
