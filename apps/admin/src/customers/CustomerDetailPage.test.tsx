import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { state } from '../test/handlers';

const customerId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-09-22T12:00:00.000Z';

describe('CustomerDetailPage', () => {
  it('shows a cleared identity without recovering a linked conversation phone', async () => {
    state.authenticated = true;
    server.use(
      http.get(`/api/admin/customers/${customerId}`, () =>
        HttpResponse.json({
          data: {
            id: customerId,
            displayName: null,
            normalizedPhone: null,
            segment: 'needs_review',
            marketingConsent: 'unknown',
            lastActivityAt: timestamp,
            createdAt: timestamp,
            orders: [],
            conversations: [
              {
                id: conversationId,
                customerPhone: 'A123456789012345',
                state: 'idle',
                updatedAt: timestamp,
              },
            ],
          },
        }),
      ),
    );
    renderWithProviders(<App />, {
      initialEntries: [`/customers/${customerId}`],
    });
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Teléfono no disponible' },
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(
      await screen.findByText(/Consentimiento de marketing: desconocido/),
    ).toBeVisible();
    expect(screen.queryByText('+573001234567')).not.toBeInTheDocument();
    expect(screen.queryByText('A123456789012345')).not.toBeInTheDocument();
  });

  it('shows derived status and links to historic orders and conversations', async () => {
    state.authenticated = true;
    server.use(
      http.get(`/api/admin/customers/${customerId}`, () =>
        HttpResponse.json({
          data: {
            id: customerId,
            displayName: 'Ana Gómez',
            normalizedPhone: '+573001234567',
            segment: 'buyer',
            marketingConsent: 'unknown',
            lastActivityAt: timestamp,
            createdAt: timestamp,
            orders: [
              {
                id: orderId,
                orderNumber: 'PED-000123',
                status: 'delivered',
                createdAt: timestamp,
              },
            ],
            conversations: [
              {
                id: conversationId,
                customerPhone: '+573001234567',
                state: 'awaiting_size',
                updatedAt: timestamp,
              },
            ],
          },
        }),
      ),
    );
    renderWithProviders(<App />, {
      initialEntries: [
        `/customers/${customerId}?conversation=${conversationId}`,
      ],
    });
    expect(
      await screen.findByRole('heading', { name: 'Ana Gómez' }),
    ).toBeVisible();
    expect(screen.getByText('Compra acreditada')).toBeVisible();
    expect(screen.getByRole('link', { name: 'PED-000123' })).toHaveAttribute(
      'href',
      `/orders/${orderId}`,
    );
    expect(
      screen.getByRole('link', { name: /Abrir conversación/ }),
    ).toHaveAttribute('href', `/conversations?conversation=${conversationId}`);
    expect(
      screen.getByRole('link', { name: 'Volver a conversación' }),
    ).toHaveAttribute('href', `/conversations?conversation=${conversationId}`);
    expect(
      screen.queryByRole('button', {
        name: /Marcar comprador|Exportar|Consentimiento/,
      }),
    ).not.toBeInTheDocument();
  });

  it('marks ambiguous identity for review and treats unknown consent as unknown', async () => {
    state.authenticated = true;
    server.use(
      http.get(`/api/admin/customers/${customerId}`, () =>
        HttpResponse.json({
          data: {
            id: customerId,
            displayName: null,
            normalizedPhone: '+573001234567',
            segment: 'needs_review',
            marketingConsent: 'unknown',
            lastActivityAt: timestamp,
            createdAt: timestamp,
            orders: [],
            conversations: [],
          },
        }),
      ),
    );
    renderWithProviders(<App />, {
      initialEntries: [`/customers/${customerId}`],
    });
    expect(await screen.findByText('Revisar identidad')).toBeVisible();
    expect(
      screen.getByText(/Consentimiento de marketing: desconocido/),
    ).toBeVisible();
    expect(screen.queryByText(/autorizado|concedido/i)).not.toBeInTheDocument();
  });
});
