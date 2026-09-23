import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { state } from '../test/handlers';

const customerId = '11111111-1111-4111-8111-111111111111';
const orderA = '22222222-2222-4222-8222-222222222222';
const orderB = '33333333-3333-4333-8333-333333333333';
const chatA = '44444444-4444-4444-8444-444444444444';
const chatB = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-09-22T12:00:00.000Z';

function customer(segment: 'buyer' | 'not_yet_buyer' | 'needs_review') {
  return {
    id: customerId,
    displayName: 'Ana Gómez',
    normalizedPhone: '+573001234567',
    segment,
    marketingConsent: 'unknown',
    lastActivityAt: timestamp,
    createdAt: timestamp,
  };
}

function unlinkedOrder(id: string, orderNumber: string) {
  return {
    id,
    orderNumber,
    customerName: 'Nombre sin confirmar',
    customerPhone: null,
    status: 'draft',
    createdAt: timestamp,
    href: `/orders/${id}`,
  };
}

function unlinkedConversation(id: string) {
  return {
    id,
    customerPhone: '+573009876543',
    state: 'awaiting_size',
    createdAt: timestamp,
    href: `/conversations?conversation=${id}`,
  };
}

describe('CustomersPage', () => {
  it('filters by confirmed buyer segment and searches contact information', async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    const requests: string[] = [];
    server.use(
      http.get('/api/admin/customers', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.search);
        const segment = url.searchParams.get('segment') as
          'buyer' | 'not_yet_buyer' | 'needs_review' | null;
        return HttpResponse.json({
          data: { items: [customer(segment ?? 'buyer')], nextCursor: null },
        });
      }),
    );
    renderWithProviders(<App />, { initialEntries: ['/customers'] });
    expect(
      await screen.findByRole('link', { name: /Ana Gómez/ }, { timeout: 5000 }),
    ).toHaveAttribute('href', `/customers/${customerId}`);
    await user.click(screen.getByRole('button', { name: 'Compradores' }));
    expect(await screen.findByText('Compra acreditada')).toBeVisible();
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar clientes' }),
      'Ana',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(
        requests.some(
          (value) =>
            value.includes('segment=buyer') && value.includes('query=Ana'),
        ),
      ).toBe(true),
    );
    await user.click(
      screen.getByRole('button', { name: 'Sin compra acreditada' }),
    );
    await waitFor(() =>
      expect(
        requests.some((value) => value.includes('segment=not_yet_buyer')),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Revisar identidad' }));
    await waitFor(() =>
      expect(
        requests.some((value) => value.includes('segment=needs_review')),
      ).toBe(true),
    );
  });

  it('shows empty and failure states without inventing a purchase', async () => {
    state.authenticated = true;
    server.use(
      http.get('/api/admin/customers', () =>
        HttpResponse.json({ data: { items: [], nextCursor: null } }),
      ),
    );
    const view = renderWithProviders(<App />, {
      initialEntries: ['/customers'],
    });
    expect(
      await screen.findByText('No hay clientes en esta vista'),
    ).toBeVisible();
    view.unmount();
    server.use(
      http.get('/api/admin/customers', () =>
        HttpResponse.json(
          { error: { code: 'failure', message: 'Consulta no disponible' } },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<App />, { initialEntries: ['/customers'] });
    expect(await screen.findByText('Consulta no disponible')).toBeVisible();
  });

  it('shows a loading state while the directory request is pending', async () => {
    state.authenticated = true;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/admin/customers', async () => {
        await pending;
        return HttpResponse.json({ data: { items: [], nextCursor: null } });
      }),
    );
    renderWithProviders(<App />, { initialEntries: ['/customers'] });
    expect(await screen.findByText('Cargando clientes…')).toBeVisible();
    release();
    expect(
      await screen.findByText('No hay clientes en esta vista'),
    ).toBeVisible();
  });

  it('paginates unresolved orders and conversations independently without duplicates', async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    const requests: Array<{
      orders: string | null;
      conversations: string | null;
    }> = [];
    server.use(
      http.get('/api/admin/customers/reconciliation', ({ request }) => {
        const url = new URL(request.url);
        const orders = url.searchParams.get('ordersCursor');
        const conversations = url.searchParams.get('conversationsCursor');
        requests.push({ orders, conversations });
        return HttpResponse.json({
          data: {
            orders:
              orders === 'order-page-2'
                ? [unlinkedOrder(orderB, 'PED-000002')]
                : [unlinkedOrder(orderA, 'PED-000001')],
            conversations:
              conversations === 'chat-page-2'
                ? [unlinkedConversation(chatB)]
                : [unlinkedConversation(chatA)],
            ordersNextCursor: orders === 'order-page-2' ? null : 'order-page-2',
            conversationsNextCursor:
              conversations === 'chat-page-2' ? null : 'chat-page-2',
          },
        });
      }),
    );
    renderWithProviders(<App />, {
      initialEntries: ['/customers/reconciliation'],
    });
    expect(await screen.findByText(/Identidad sin resolver/)).toBeVisible();
    const orderSection = await screen.findByRole('region', {
      name: 'Pedidos pendientes',
    });
    const conversationSection = screen.getByRole('region', {
      name: 'Conversaciones pendientes',
    });
    expect(
      within(orderSection).getByRole('link', { name: 'PED-000001' }),
    ).toHaveAttribute('href', `/orders/${orderA}`);
    expect(
      within(conversationSection).getByRole('link', {
        name: /Abrir conversación/,
      }),
    ).toHaveAttribute('href', `/conversations?conversation=${chatA}`);
    await user.click(
      within(orderSection).getByRole('button', {
        name: 'Cargar más pedidos pendientes',
      }),
    );
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000002' }),
    ).toBeVisible();
    expect(
      within(conversationSection).getAllByRole('link', {
        name: /Abrir conversación/,
      }),
    ).toHaveLength(1);
    await user.click(
      within(conversationSection).getByRole('button', {
        name: 'Cargar más conversaciones pendientes',
      }),
    );
    expect(
      await within(conversationSection).findAllByRole('link', {
        name: /Abrir conversación/,
      }),
    ).toHaveLength(2);
    expect(
      within(orderSection).getAllByRole('link', { name: /PED-/ }),
    ).toHaveLength(2);
    expect(requests).toEqual([
      { orders: null, conversations: null },
      { orders: 'order-page-2', conversations: 'chat-page-2' },
      { orders: null, conversations: 'chat-page-2' },
    ]);
    expect(
      within(orderSection).queryByRole('button', {
        name: 'Cargar más pedidos pendientes',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(conversationSection).queryByRole('button', {
        name: 'Cargar más conversaciones pendientes',
      }),
    ).not.toBeInTheDocument();
  });
});
