import { screen, waitFor, within } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
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
const orderC = '66666666-6666-4666-8666-666666666666';
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

function RefreshReconciliationButton() {
  const client = useQueryClient();
  return (
    <button
      type="button"
      onClick={() =>
        void client.invalidateQueries({
          queryKey: ['customers-reconciliation'],
        })
      }
    >
      Refrescar prueba
    </button>
  );
}

describe('CustomersPage', () => {
  it('shows a neutral label when an anonymized customer has no phone', async () => {
    state.authenticated = true;
    server.use(
      http.get('/api/admin/customers', () =>
        HttpResponse.json({
          data: {
            items: [
              {
                ...customer('needs_review'),
                displayName: null,
                normalizedPhone: null,
              },
            ],
            nextCursor: null,
          },
        }),
      ),
    );
    renderWithProviders(<App />, { initialEntries: ['/customers'] });
    const link = await screen.findByRole(
      'link',
      {
        name: 'Teléfono no disponible',
      },
      { timeout: 5000 },
    );
    expect(link).toHaveAttribute('href', `/customers/${customerId}`);
    expect(screen.getAllByText('Teléfono no disponible')).toHaveLength(2);
    expect(screen.queryByText('+573001234567')).not.toBeInTheDocument();
  });

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
      kind: string | null;
      orders: string | null;
      conversations: string | null;
    }> = [];
    server.use(
      http.get('/api/admin/customers/reconciliation', ({ request }) => {
        const url = new URL(request.url);
        const orders = url.searchParams.get('ordersCursor');
        const conversations = url.searchParams.get('conversationsCursor');
        const kind = url.searchParams.get('kind');
        requests.push({ kind, orders, conversations });
        return HttpResponse.json({
          data: {
            orders:
              kind === 'conversations'
                ? []
                : orders === 'order-page-2'
                  ? [unlinkedOrder(orderB, 'PED-000002')]
                  : [unlinkedOrder(orderA, 'PED-000001')],
            conversations:
              kind === 'orders'
                ? []
                : conversations === 'chat-page-2'
                  ? [unlinkedConversation(chatB)]
                  : [unlinkedConversation(chatA)],
            ordersNextCursor:
              kind === 'conversations' || orders === 'order-page-2'
                ? null
                : 'order-page-2',
            conversationsNextCursor:
              kind === 'orders' || conversations === 'chat-page-2'
                ? null
                : 'chat-page-2',
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
      { kind: 'all', orders: null, conversations: null },
      { kind: 'orders', orders: 'order-page-2', conversations: 'chat-page-2' },
      { kind: 'conversations', orders: null, conversations: 'chat-page-2' },
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

  it('replaces stale appended pages when the first reconciliation page refetches', async () => {
    state.authenticated = true;
    let firstPageCalls = 0;
    server.use(
      http.get('/api/admin/customers/reconciliation', ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('kind') === 'orders' || params.has('ordersCursor'))
          return HttpResponse.json({
            data: {
              orders: [unlinkedOrder(orderB, 'PED-000002')],
              conversations: [],
              ordersNextCursor: null,
              conversationsNextCursor: null,
            },
          });
        firstPageCalls += 1;
        return HttpResponse.json({
          data: {
            orders: [
              firstPageCalls === 1
                ? unlinkedOrder(orderA, 'PED-000001')
                : unlinkedOrder(chatB, 'PED-000003'),
            ],
            conversations: [unlinkedConversation(chatA)],
            ordersNextCursor: firstPageCalls === 1 ? 'order-page-2' : null,
            conversationsNextCursor: null,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <App />
        <RefreshReconciliationButton />
      </>,
      { initialEntries: ['/customers/reconciliation'] },
    );
    const orderSection = await screen.findByRole('region', {
      name: 'Pedidos pendientes',
    });
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000001' }),
    ).toBeVisible();
    await user.click(
      within(orderSection).getByRole('button', {
        name: 'Cargar más pedidos pendientes',
      }),
    );
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000002' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refrescar prueba' }));
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000003' }),
    ).toBeVisible();
    expect(
      within(orderSection).queryByRole('link', { name: 'PED-000001' }),
    ).not.toBeInTheDocument();
    expect(
      within(orderSection).queryByRole('link', { name: 'PED-000002' }),
    ).not.toBeInTheDocument();
  });

  it('invalidates appended orders after a refetch with an unchanged first page', async () => {
    state.authenticated = true;
    let firstPageCalls = 0;
    let secondPageCalls = 0;
    server.use(
      http.get('/api/admin/customers/reconciliation', ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('kind') === 'orders') {
          secondPageCalls += 1;
          return HttpResponse.json({
            data: {
              orders: [
                secondPageCalls === 1
                  ? unlinkedOrder(orderB, 'PED-000002')
                  : unlinkedOrder(orderC, 'PED-000003'),
              ],
              conversations: [],
              ordersNextCursor: null,
              conversationsNextCursor: null,
            },
          });
        }
        firstPageCalls += 1;
        return HttpResponse.json({
          data: {
            orders: [unlinkedOrder(orderA, 'PED-000001')],
            conversations: [unlinkedConversation(chatA)],
            ordersNextCursor: 'order-page-2',
            conversationsNextCursor: null,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <App />
        <RefreshReconciliationButton />
      </>,
      { initialEntries: ['/customers/reconciliation'] },
    );
    const orderSection = await screen.findByRole('region', {
      name: 'Pedidos pendientes',
    });
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000001' }),
    ).toBeVisible();
    await user.click(
      within(orderSection).getByRole('button', {
        name: 'Cargar más pedidos pendientes',
      }),
    );
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000002' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refrescar prueba' }));
    await waitFor(() => expect(firstPageCalls).toBe(2));
    await waitFor(() =>
      expect(
        within(orderSection).queryByRole('link', { name: 'PED-000002' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(orderSection).getByRole('link', { name: 'PED-000001' }),
    ).toBeVisible();
    await user.click(
      within(orderSection).getByRole('button', {
        name: 'Cargar más pedidos pendientes',
      }),
    );
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000003' }),
    ).toBeVisible();
  });

  it('ignores a late order page from before an unchanged first-page refetch', async () => {
    state.authenticated = true;
    let firstPageCalls = 0;
    let releaseSecondPage!: () => void;
    const secondPagePending = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    server.use(
      http.get('/api/admin/customers/reconciliation', async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('kind') === 'orders') {
          await secondPagePending;
          return HttpResponse.json({
            data: {
              orders: [unlinkedOrder(orderB, 'PED-000002')],
              conversations: [],
              ordersNextCursor: null,
              conversationsNextCursor: null,
            },
          });
        }
        firstPageCalls += 1;
        return HttpResponse.json({
          data: {
            orders: [unlinkedOrder(orderA, 'PED-000001')],
            conversations: [unlinkedConversation(chatA)],
            ordersNextCursor: 'order-page-2',
            conversationsNextCursor: null,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <App />
        <RefreshReconciliationButton />
      </>,
      { initialEntries: ['/customers/reconciliation'] },
    );
    const orderSection = await screen.findByRole('region', {
      name: 'Pedidos pendientes',
    });
    expect(
      await within(orderSection).findByRole('link', { name: 'PED-000001' }),
    ).toBeVisible();
    const loadButton = within(orderSection).getByRole('button', {
      name: 'Cargar más pedidos pendientes',
    });
    await user.click(loadButton);
    await waitFor(() =>
      expect(loadButton).toHaveAttribute('aria-busy', 'true'),
    );
    await user.click(screen.getByRole('button', { name: 'Refrescar prueba' }));
    await waitFor(() => expect(firstPageCalls).toBe(2));
    releaseSecondPage();
    await waitFor(() => expect(loadButton).not.toHaveAttribute('aria-busy'));
    expect(
      within(orderSection).queryByRole('link', { name: 'PED-000002' }),
    ).not.toBeInTheDocument();
    expect(
      within(orderSection).getByRole('link', { name: 'PED-000001' }),
    ).toBeVisible();
  });
});
