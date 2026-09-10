import { and, eq, max, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappConversationEvents,
  whatsappConversationMessages,
  whatsappConversations,
} from '../../database/schema.js';
import {
  advanceConversation,
  type ConversationTransition,
} from './conversation-state.js';

export type ReceiveConversationInput = Readonly<{
  whatsappMessageId: string;
  customerPhone: string;
  text: string;
  occurredAt?: Date;
}>;

export type ReceiveConversationResult = Readonly<{
  duplicate: boolean;
  conversationId?: string;
  state: string;
  reply: string | null;
  selectedSize?: string | null;
  activeOrderId?: string | null;
  pendingDepartment?: string | null;
  activeSummaryVersion?: number | null;
  action?: ConversationTransition['action'];
  input?: string;
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

      const now = input.occurredAt ?? new Date();
      const transition = advanceConversation(
        existing === undefined
          ? null
          : (existing.state as import('./conversation-state.js').ConversationState),
        input.text,
        existing?.invalidAttempts ?? 0,
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
        .insert(whatsappConversationMessages)
        .values({
          conversationId: conversation.id,
          providerMessageId: input.whatsappMessageId,
          source: 'customer',
          messageType: 'text',
          textBody: input.text,
          status: 'received',
          occurredAt: now,
        })
        .onConflictDoNothing({
          target: whatsappConversationMessages.providerMessageId,
        });
      await tx
        .update(whatsappConversations)
        .set({
          state: transition.state,
          ...(transition.selectedSize === undefined
            ? {}
            : { selectedSize: transition.selectedSize }),
          ...(transition.invalidAttempts === undefined
            ? transition.selectedSize === undefined
              ? {}
              : { invalidAttempts: 0 }
            : { invalidAttempts: transition.invalidAttempts }),
          ...(transition.action === 'human_takeover' ? { mode: 'human' } : {}),
          ...(transition.action === 'collect_department'
            ? { pendingDepartment: transition.input ?? null }
            : {}),
          lastInboundMessageAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(whatsappConversations.id, conversation.id),
            eq(whatsappConversations.customerPhone, input.customerPhone),
          ),
        );
      return {
        duplicate: false,
        conversationId: conversation.id,
        state: transition.state,
        reply,
        selectedSize:
          transition.selectedSize === undefined
            ? (existing?.selectedSize ?? null)
            : transition.selectedSize,
        activeOrderId: existing?.activeOrderId ?? null,
        pendingDepartment:
          transition.action === 'collect_department'
            ? (transition.input ?? null)
            : (existing?.pendingDepartment ?? null),
        activeSummaryVersion: existing?.activeSummaryVersion ?? null,
        ...(transition.action === undefined
          ? {}
          : { action: transition.action }),
        ...(transition.input === undefined ? {} : { input: transition.input }),
      };
    });
  }

  async returnToSize(conversationId: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({
        state: 'awaiting_size',
        selectedSize: null,
        selectedReferenceId: null,
        invalidAttempts: 0,
        pendingDepartment: null,
        activeSummaryVersion: null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async attachOrder(
    conversationId: string,
    referenceId: string,
    orderId: string,
  ): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({
        state: 'awaiting_name',
        selectedReferenceId: referenceId,
        activeOrderId: orderId,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async setSummaryVersion(
    conversationId: string,
    version: number,
  ): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({ activeSummaryVersion: version, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async setState(conversationId: string, state: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({ state, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }
}
