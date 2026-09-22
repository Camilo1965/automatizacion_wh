import { describe, expect, it } from 'vitest';

import { assertOutboundMessageTransition } from '../src/modules/whatsapp/outbound-message-state.js';

describe('outbound message state transitions', () => {
  it('allows claim and cancel from pending', () => {
    expect(assertOutboundMessageTransition('pending', 'claim')).toBe(
      'processing',
    );
    expect(assertOutboundMessageTransition('pending', 'cancel')).toBe(
      'cancelled',
    );
  });

  it('allows processing outcomes', () => {
    expect(assertOutboundMessageTransition('processing', 'mark_sent')).toBe(
      'sent',
    );
    expect(assertOutboundMessageTransition('processing', 'mark_failed')).toBe(
      'failed',
    );
  });

  it('rejects illegal transitions', () => {
    expect(() =>
      assertOutboundMessageTransition('sent', 'mark_failed'),
    ).toThrow('not allowed');
    expect(() => assertOutboundMessageTransition('failed', 'claim')).toThrow(
      'not allowed',
    );
    expect(() =>
      assertOutboundMessageTransition('cancelled', 'mark_sent'),
    ).toThrow('not allowed');
  });
});
