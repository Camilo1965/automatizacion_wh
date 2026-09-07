import { and, eq, max, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappConversationEvents,
  whatsappConversations,
} from '../../database/schema.js';
import { advanceConversation } from './conversation-state.js';

export type ReceiveConversationInput = Readonly<{
  whatsappMessageId: string;
  customerPhone: string;
  text: string;
}>;

export type ReceiveConversationResult = Readonly<{
  duplicate: boolean;
  state: string;
  reply: string | null;
}>;

export class PostgresConversationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  receive(input: ReceiveConversationInput): Promise<ReceiveConversationResult> {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.customerPhone}))`,
      );

      const [duplicate] = await tx
        .select({ id: whatsappConversationEvents.id })
        .from(whatsappConversationEvents)
        .where(
          eq(
            whatsappConversationEvents.whatsappMessageId,
            input.whatsappMessageId,
          ),
        )
        .limit(1);
      const [existing] = await tx
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.customerPhone, input.customerPhone))
        .limit(1);

      if (duplicate !== undefined) {
        return {
          duplicate: true,
          state: existing?.state ?? 'awaiting_size',
          reply: null,
        };
      }

      const now = new Date();
      const transition = advanceConversation(
        existing?.state === 'showing_models'
          ? 'showing_models'
          : existing === undefined
            ? null
            : 'awaiting_size',
        input.text,
      );
      const conversation =
        existing ??
        (
          await tx
            .insert(whatsappConversations)
            .values({
              customerPhone: input.customerPhone,
              state: transition.state,
              lastInboundMessageAt: now,
            })
            .returning()
        )[0];
      if (conversation === undefined)
        throw new Error('Conversation insert failed');

      const [sequenceRow] = await tx
        .select({ value: max(whatsappConversationEvents.sequence) })
        .from(whatsappConversationEvents)
        .where(eq(whatsappConversationEvents.conversationId, conversation.id));
      const lastSequence = sequenceRow?.value ?? 0;
      const reply = conversation.mode === 'human' ? null : transition.reply;

      await tx.insert(whatsappConversationEvents).values({
        conversationId: conversation.id,
        whatsappMessageId: input.whatsappMessageId,
        sequence: lastSequence + 1,
        stateBefore: existing?.state ?? null,
        stateAfter: transition.state,
      });
      await tx
        .update(whatsappConversations)
        .set({
          state: transition.state,
          lastInboundMessageAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(whatsappConversations.id, conversation.id),
            eq(whatsappConversations.customerPhone, input.customerPhone),
          ),
        );
      return { duplicate: false, state: transition.state, reply };
    });
  }
}
