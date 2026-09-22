import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  inventoryClosures,
  orderConfirmations,
  shippingGuideJobs,
  whatsappInboundMessages,
  whatsappOutboundMessages,
} from '../src/database/schema/index.js';

/**
 * Schema-name smoke only. Concurrent DB proof lives in:
 * - critical-idempotency.integration.test.ts
 * - critical-concurrency.integration.test.ts
 */
function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.name)
    .filter((name): name is string => typeof name === 'string');
}

describe('critical-path idempotency schema smoke', () => {
  it('keeps unique keys that concurrent integration tests exercise', () => {
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
    expect(uniqueConstraintNames(inventoryClosures)).toEqual(
      expect.arrayContaining(['inventory_closures_date_version_unique']),
    );
  });
});
