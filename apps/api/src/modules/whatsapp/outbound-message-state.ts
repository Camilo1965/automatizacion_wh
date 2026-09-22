export type OutboundMessageStatus =
  'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';

export type OutboundMessageAction =
  'claim' | 'mark_sent' | 'mark_failed' | 'cancel';

const transitions: Readonly<
  Record<
    OutboundMessageStatus,
    Partial<Record<OutboundMessageAction, OutboundMessageStatus>>
  >
> = {
  pending: { claim: 'processing', cancel: 'cancelled' },
  processing: { mark_sent: 'sent', mark_failed: 'failed' },
  sent: {},
  failed: {},
  cancelled: {},
};

export function assertOutboundMessageTransition(
  current: OutboundMessageStatus,
  action: OutboundMessageAction,
): OutboundMessageStatus {
  const next = transitions[current][action];
  if (next === undefined) {
    throw new Error(
      `Action ${action} is not allowed from outbound message ${current}`,
    );
  }
  return next;
}
