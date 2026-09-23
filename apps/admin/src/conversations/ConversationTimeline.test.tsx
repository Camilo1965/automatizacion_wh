import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadGuidePdf } from '../api/orders-api';
import { renderWithProviders } from '../test/render';
import { ConversationTimeline } from './ConversationTimeline';

vi.mock('../api/orders-api', () => ({
  downloadGuidePdf: vi.fn(),
}));

const conversationId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const guideEvent = {
  id: '33333333-3333-4333-8333-333333333333',
  conversationId,
  source: 'system' as const,
  messageType: 'event' as const,
  text: null,
  mediaUrl: null,
  status: 'internal' as const,
  providerMessageId: null,
  occurredAt: '2026-09-10T12:00:00.000Z',
  orderId,
  orderNumber: 'PED-000123',
  guideJobId: '44444444-4444-4444-8444-444444444444',
  preShipmentNumber: 'PRE-123456',
  carrier: '99envíos',
};

describe('ConversationTimeline', () => {
  beforeEach(() => {
    vi.mocked(downloadGuidePdf).mockReset();
    vi.mocked(downloadGuidePdf).mockResolvedValue(undefined);
  });

  it('renders an internal guide card with order link and pre-shipment details', () => {
    renderWithProviders(<ConversationTimeline messages={[guideEvent]} />);

    expect(screen.getByText('Guía de envío creada')).toBeVisible();
    expect(
      screen.getByText('Solo visible para el equipo de KAIRO'),
    ).toBeVisible();
    expect(screen.getByText('99envíos')).toBeVisible();
    expect(screen.getByText('PRE-123456')).toBeVisible();
    expect(screen.getByRole('link', { name: 'PED-000123' })).toHaveAttribute(
      'href',
      `/orders/${orderId}`,
    );
    expect(
      screen.queryByText(/Enviado|Entregado|Leído/),
    ).not.toBeInTheDocument();
  });

  it('downloads the already-created guide and allows retry after a download error', async () => {
    const user = userEvent.setup();
    vi.mocked(downloadGuidePdf)
      .mockRejectedValueOnce(new Error('No se pudo descargar la guía'))
      .mockResolvedValueOnce(undefined);
    renderWithProviders(<ConversationTimeline messages={[guideEvent]} />);

    await user.click(
      screen.getByRole('button', { name: 'Descargar guía PDF' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo descargar la guía',
    );
    await user.click(
      screen.getByRole('button', { name: 'Reintentar descarga' }),
    );

    await waitFor(() => expect(downloadGuidePdf).toHaveBeenCalledTimes(2));
    expect(downloadGuidePdf).toHaveBeenNthCalledWith(
      1,
      orderId,
      'PED-000123',
      'PRE-123456',
    );
    expect(downloadGuidePdf).toHaveBeenNthCalledWith(
      2,
      orderId,
      'PED-000123',
      'PRE-123456',
    );
  });

  it('shows a pending state and prevents duplicate download clicks', async () => {
    const user = userEvent.setup();
    let resolveDownload!: () => void;
    vi.mocked(downloadGuidePdf).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    renderWithProviders(<ConversationTimeline messages={[guideEvent]} />);

    const download = screen.getByRole('button', { name: 'Descargar guía PDF' });
    await user.click(download);
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute('aria-busy', 'true');
    expect(downloadGuidePdf).toHaveBeenCalledOnce();
    resolveDownload();
    await waitFor(() => expect(download).toBeEnabled());
  });

  it('renders document attachments safely without creating broken media links or images', () => {
    const documentMessage = {
      id: '55555555-5555-4555-8555-555555555555',
      conversationId,
      source: 'customer' as const,
      messageType: 'document' as const,
      text: 'Archivo adjunto',
      mediaUrl: `/api/admin/conversations/${conversationId}/messages/abc/media`,
      status: 'received' as const,
      providerMessageId: null,
      occurredAt: '2026-09-10T12:00:00.000Z',
    };
    const { container } = renderWithProviders(
      <ConversationTimeline messages={[documentMessage]} />,
    );

    expect(screen.getByText('Archivo adjunto')).toBeVisible();
    expect(screen.getByText('Documento adjunto no disponible')).toBeVisible();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(
      container.querySelector(`a[href="${documentMessage.mediaUrl}"]`),
    ).toBeNull();
  });

  it('keeps guide download keyboard accessible on a narrow viewport', async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });
    renderWithProviders(<ConversationTimeline messages={[guideEvent]} />);

    const download = screen.getByRole('button', { name: 'Descargar guía PDF' });
    expect(download).toHaveClass('w-full');
    download.focus();
    expect(download).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(downloadGuidePdf).toHaveBeenCalledWith(
      orderId,
      'PED-000123',
      'PRE-123456',
    );

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });
});
