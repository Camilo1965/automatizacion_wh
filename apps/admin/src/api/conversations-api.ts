import { z } from 'zod';
import { ConversationMessagesPageSchema } from '@camila/contracts';

import { apiRequest } from './client';

const conversationSchema = z
  .object({
    id: z.string().uuid(),
    customerPhone: z.string().min(1),
    state: z.string().min(1),
    mode: z.enum(['bot', 'human']),
    selectedSize: z.string().nullable().optional(),
    activeOrderId: z.string().uuid().nullable().optional(),
    pendingOutbound: z.number().int().nonnegative(),
    lastInboundMessageAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

const listSchema = z
  .object({ data: z.object({ items: z.array(conversationSchema) }).strict() })
  .strict();
const detailSchema = z.object({ data: conversationSchema.nullable() }).strict();

export type ConversationPublic = z.infer<typeof conversationSchema>;
export type ConversationMessagePublic = z.infer<
  typeof ConversationMessagesPageSchema
>['items'][number];

export async function listConversations(): Promise<
  readonly ConversationPublic[]
> {
  return (await apiRequest('/conversations', { schema: listSchema })).data
    .items;
}

const messagesResponseSchema = z
  .object({ data: ConversationMessagesPageSchema })
  .strict();

export async function listConversationMessages(conversationId: string) {
  return (
    await apiRequest(`/conversations/${conversationId}/messages`, {
      schema: messagesResponseSchema,
    })
  ).data;
}

const queuedMessageResponseSchema = z
  .object({
    data: z
      .object({ id: z.string().min(1), status: z.literal('queued') })
      .strict(),
  })
  .strict();

export async function sendConversationMessage(
  conversationId: string,
  text: string,
  clientRequestId = crypto.randomUUID(),
) {
  return (
    await apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { clientRequestId, text },
      schema: queuedMessageResponseSchema,
    })
  ).data;
}

export async function setConversationControl(
  conversationId: string,
  action: 'take-control' | 'release-control',
): Promise<ConversationPublic | null> {
  return (
    await apiRequest(`/conversations/${conversationId}/${action}`, {
      method: 'POST',
      schema: detailSchema,
    })
  ).data;
}
