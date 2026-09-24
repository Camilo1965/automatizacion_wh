import { z } from 'zod';

import { OrderStatusSchema } from './orders.js';
import { dataEnvelopeSchema } from './shared.js';

export const CustomerSegmentSchema = z.enum([
  'buyer',
  'not_yet_buyer',
  'needs_review',
]);
export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

export const CustomerListQuerySchema = z
  .object({
    segment: CustomerSegmentSchema.optional(),
    query: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const CustomerReconciliationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    kind: z.enum(['all', 'orders', 'conversations']).default('all'),
    ordersCursor: z.string().min(1).max(512).optional(),
    conversationsCursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const CustomerIdParamsSchema = z
  .object({ customerId: z.uuid() })
  .strict();

export const CustomerSummarySchema = z
  .object({
    id: z.uuid(),
    displayName: z.string().nullable(),
    normalizedPhone: z
      .string()
      .regex(/^\+573\d{9}$/)
      .nullable(),
    segment: CustomerSegmentSchema,
    marketingConsent: z.enum(['unknown', 'granted', 'denied', 'revoked']),
    lastActivityAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;

export const CustomerDetailSchema = CustomerSummarySchema.extend({
  orders: z.array(
    z
      .object({
        id: z.uuid(),
        orderNumber: z.string().regex(/^PED-\d{6,}$/),
        status: OrderStatusSchema,
        createdAt: z.string().datetime(),
      })
      .strict(),
  ),
  conversations: z.array(
    z
      .object({
        id: z.uuid(),
        customerPhone: z.string(),
        state: z.string(),
        updatedAt: z.string().datetime(),
      })
      .strict(),
  ),
}).strict();
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

export const CustomerReconciliationSchema = z
  .object({
    orders: z.array(
      z
        .object({
          id: z.uuid(),
          orderNumber: z.string().regex(/^PED-\d{6,}$/),
          customerName: z.string().nullable(),
          customerPhone: z.string().nullable(),
          status: OrderStatusSchema,
          createdAt: z.string().datetime(),
          href: z.string().regex(/^\/orders\/[0-9a-f-]{36}$/),
        })
        .strict(),
    ),
    conversations: z.array(
      z
        .object({
          id: z.uuid(),
          customerPhone: z.string(),
          state: z.string(),
          createdAt: z.string().datetime(),
          href: z
            .string()
            .regex(/^\/conversations\?conversation=[0-9a-f-]{36}$/),
        })
        .strict(),
    ),
    ordersNextCursor: z.string().nullable(),
    conversationsNextCursor: z.string().nullable(),
  })
  .strict();
export type CustomerReconciliation = z.infer<
  typeof CustomerReconciliationSchema
>;

export const CustomerListResponseSchema = dataEnvelopeSchema(
  z
    .object({
      items: z.array(CustomerSummarySchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
);
export const CustomerDetailResponseSchema =
  dataEnvelopeSchema(CustomerDetailSchema);
export const CustomerReconciliationResponseSchema = dataEnvelopeSchema(
  CustomerReconciliationSchema,
);
