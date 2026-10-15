import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConversationPublic } from '../api/conversations-api';
import { ConversationList } from './ConversationList';

const conversation = {
  id: '11111111-1111-4111-8111-111111111111',
  customerPhone: '+573001234567',
  customerId: null,
  customerName: 'Ana Gómez',
  lastPreview: 'Hola, quisiera saber si tienen talla 37',
  unreadCount: 2,
  lastMessageAt: '2026-10-14T20:10:00.000Z',
  state: 'awaiting_size',
  mode: 'human',
  selectedSize: null,
  activeOrderId: null,
  pendingOutbound: 0,
  lastInboundMessageAt: '2026-10-14T20:10:00.000Z',
  updatedAt: '2026-10-14T20:10:00.000Z',
} satisfies ConversationPublic;

describe('ConversationList', () => {
  it('shows customer identity, latest message and unread count for triage', () => {
    render(
      <ConversationList
        items={[conversation]}
        selectedId={conversation.id}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText('Ana Gómez')).toBeVisible();
    expect(
      screen.getByText('Hola, quisiera saber si tienen talla 37'),
    ).toBeVisible();
    expect(screen.getByText('2 sin leer')).toBeVisible();
  });
});
