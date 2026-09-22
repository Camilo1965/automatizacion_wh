import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  orderConfirmations,
  shippingGuideJobs,
  whatsappInboundMessages,
  whatsappOutboundMessages,
} from '../src/database/schema/index.js';

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.name)
    .filter((name): name is string => typeof name === 'string');
}

describe('critical-path idempotency constraints', () => {
  it('keeps unique keys on confirm, outbound, inbound, and guide jobs', () => {
    expect(uniqueConstraintNames(orderConfirmations)).toEqual(
      expect.arrayContaining([
        'order_confirmations_order_unique',
        'order_confirmations_idempotency_key_unique',
      ]),
    );
    expect(uniqueConstraintNames(whatsappOutboundMessages)).toEqual(
      expect.arrayContaining(['whatsapp_outbound_messages_idempotency_unique']),
    );
    expect(uniqueConstraintNames(whatsappInboundMessages)).toEqual(
      expect.arrayContaining(['whatsapp_inbound_messages_message_id_unique']),
    );
    expect(uniqueConstraintNames(shippingGuideJobs)).toEqual(
      expect.arrayContaining(['shipping_guide_jobs_order_unique']),
    );
  });
});
