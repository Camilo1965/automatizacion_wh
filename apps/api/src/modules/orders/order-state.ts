import type { OrderStatus } from '@camila/contracts';
import { OrderConflictError } from './order-errors.js';

export type OrderAction =
  'confirm' | 'cancel' | 'dispatch' | 'deliver' | 'return';

const transitions: Readonly<
  Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>>
> = {
  draft: { confirm: 'confirmed', cancel: 'cancelled' },
  confirmed: { cancel: 'cancelled', dispatch: 'dispatched' },
  cancelled: {},
  dispatched: { deliver: 'delivered', return: 'returned' },
  delivered: { return: 'returned' },
  returned: {},
};

export function assertTransition(
  current: OrderStatus,
  action: OrderAction,
): OrderStatus {
  const next = transitions[current][action];
  if (next === undefined) {
    throw new OrderConflictError(
      'invalid_order_transition',
      `Action ${action} is not allowed from ${current}`,
    );
  }
  return next;
}
