import { z } from 'zod';

export const ConversationMessageSourceSchema = z.enum([
  'customer',
  'bot',
  'owner_panel',
  'owner_mobile',
]);

export const ConversationMessageStatusSchema = z.enum([
  'received',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'cancelled',
]);

export const ConversationMessageTypeSchema = z.enum([
  'text',
  'image',
  'template',
  'document',
  'event',
]);

export const ConversationMessagePublicSchema = z
  .object({
    id: z.uuid(),
    conversationId: z.uuid(),
    source: ConversationMessageSourceSchema,
    messageType: ConversationMessageTypeSchema,
    text: z.string().nullable(),
    mediaUrl: z.string().nullable(),
    status: ConversationMessageStatusSchema,
    providerMessageId: z.string().min(1).nullable(),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const ConversationOperationalLabelSchema = z.enum([
  'new',
  'choosing_size',
  'catalog_sent',
  'data_pending',
  'order_confirmed',
  'creating_guide',
  'ready_to_dispatch',
  'attention_required',
  'incident',
  'cancelled',
  'delivered',
  'returned',
]);

export const ConversationControlOwnerSchema = z.enum([
  'bot',
  'owner_panel',
  'owner_mobile',
]);

export const ConversationSummarySchema = z
  .object({
    id: z.uuid(),
    customerName: z.string().min(1).nullable(),
    customerPhone: z.string().min(7).max(20),
    lastPreview: z.string().nullable(),
    unreadCount: z.number().int().nonnegative(),
    operationalLabel: ConversationOperationalLabelSchema,
    controlOwner: ConversationControlOwnerSchema,
    activeOrderId: z.uuid().nullable(),
    lastMessageAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const CursorSchema = z.string().min(1).nullable();

export const ConversationPageSchema = z
  .object({
    items: z.array(ConversationSummarySchema),
    nextCursor: CursorSchema,
  })
  .strict();

export const ConversationMessagesPageSchema = z
  .object({
    items: z.array(ConversationMessagePublicSchema),
    nextCursor: CursorSchema,
  })
  .strict();

export type ConversationMessagePublic = z.infer<
  typeof ConversationMessagePublicSchema
>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
