import { z } from 'zod';

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

export async function listConversations(): Promise<
  readonly ConversationPublic[]
> {
  return (await apiRequest('/conversations', { schema: listSchema })).data
    .items;
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
