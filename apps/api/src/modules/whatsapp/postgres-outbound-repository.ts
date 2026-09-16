import { eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappConversationMessages,
  whatsappOutboundMessages,
} from '../../database/schema.js';
import type {
  ClaimedOutboundMessage,
  OutboxWorkerRepository,
} from './outbox-worker.js';

export type EnqueueTextInput = Readonly<{
  conversationId?: string;
  customerPhone: string;
  body: string;
  idempotencyKey: string;
  source?: 'bot' | 'owner_panel' | 'owner_mobile';
}>;

export type EnqueueImageInput = Readonly<{
  conversationId?: string;
  customerPhone: string;
  caption: string;
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png';
  idempotencyKey: string;
  source?: 'bot' | 'owner_panel' | 'owner_mobile';
}>;

export class PostgresOutboundRepository implements OutboxWorkerRepository {
  constructor(private readonly database: PostgresDatabase) {}
  async enqueueDocument(input: {
    conversationId: string;
    customerPhone: string;
    storageKey: string;
    caption: string;
    idempotencyKey: string;
  }) {
    return this.database.orm.transaction(async (tx) => {
      const [message] = await tx
        .insert(whatsappOutboundMessages)
        .values({
          conversationId: input.conversationId,
          customerPhone: input.customerPhone,
          messageType: 'document',
          mediaStorageKey: input.storageKey,
          mediaMimeType: 'application/pdf',
          textBody: input.caption,
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing({
          target: whatsappOutboundMessages.idempotencyKey,
        })
        .returning({ id: whatsappOutboundMessages.id });
      if (message)
        await tx.insert(whatsappConversationMessages).values({
          conversationId: input.conversationId,
          outboundMessageId: message.id,
          source: 'bot',
          messageType: 'document',
          mediaStorageKey: input.storageKey,
          mediaMimeType: 'application/pdf',
          textBody: input.caption,
          status: 'queued',
          occurredAt: new Date(),
        });
      return message ?? null;
    });
  }

  async enqueueText(
    input: EnqueueTextInput,
  ): Promise<Readonly<{ id: string }>> {
    return this.database.orm.transaction(async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(whatsappOutboundMessages)
        .values({
          ...(input.conversationId === undefined
            ? {}
            : { conversationId: input.conversationId }),
          customerPhone: input.customerPhone,
          idempotencyKey: input.idempotencyKey,
          source: input.source ?? 'bot',
          messageType: 'text',
          textBody: input.body,
        })
        .onConflictDoNothing({
          target: whatsappOutboundMessages.idempotencyKey,
        })
        .returning({ id: whatsappOutboundMessages.id });
      if (inserted !== undefined) {
        if (input.conversationId !== undefined) {
          await tx.insert(whatsappConversationMessages).values({
            conversationId: input.conversationId,
            outboundMessageId: inserted.id,
            source: input.source ?? 'bot',
            messageType: 'text',
            textBody: input.body,
            status: 'queued',
            occurredAt: now,
          });
        }
        return inserted;
      }

      const [existing] = await tx
        .select({ id: whatsappOutboundMessages.id })
        .from(whatsappOutboundMessages)
        .where(
          eq(whatsappOutboundMessages.idempotencyKey, input.idempotencyKey),
        )
        .limit(1);
      if (existing === undefined) throw new Error('Outbound enqueue failed');
      return existing;
    });
  }

  async enqueueImage(
    input: EnqueueImageInput,
  ): Promise<Readonly<{ id: string }>> {
    return this.database.orm.transaction(async (tx) => {
      const now = new Date();
      const [inserted] = await tx
        .insert(whatsappOutboundMessages)
        .values({
          ...(input.conversationId === undefined
            ? {}
            : { conversationId: input.conversationId }),
          customerPhone: input.customerPhone,
          idempotencyKey: input.idempotencyKey,
          source: input.source ?? 'bot',
          messageType: 'image',
          textBody: input.caption,
          mediaStorageKey: input.storageKey,
          mediaMimeType: input.mimeType,
        })
        .onConflictDoNothing({
          target: whatsappOutboundMessages.idempotencyKey,
        })
        .returning({ id: whatsappOutboundMessages.id });
      if (inserted !== undefined) {
        if (input.conversationId !== undefined) {
          await tx.insert(whatsappConversationMessages).values({
            conversationId: input.conversationId,
            outboundMessageId: inserted.id,
            source: input.source ?? 'bot',
            messageType: 'image',
            textBody: input.caption,
            mediaStorageKey: input.storageKey,
            mediaMimeType: input.mimeType,
            status: 'queued',
            occurredAt: now,
          });
        }
        return inserted;
      }
      const [existing] = await tx
        .select({ id: whatsappOutboundMessages.id })
        .from(whatsappOutboundMessages)
        .where(
          eq(whatsappOutboundMessages.idempotencyKey, input.idempotencyKey),
        )
        .limit(1);
      if (existing === undefined) throw new Error('Outbound enqueue failed');
      return existing;
    });
  }

  async claimNext(): Promise<ClaimedOutboundMessage | null> {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(sql`
        WITH cancelled AS (
          UPDATE whatsapp_outbound_messages AS outbound
          SET status = 'cancelled', updated_at = clock_timestamp()
          FROM whatsapp_conversations AS conversation
          WHERE outbound.conversation_id = conversation.id
            AND outbound.status = 'pending'
            AND outbound.source = 'bot'
            AND conversation.mode = 'human'
          RETURNING outbound.id
        )
        UPDATE whatsapp_conversation_messages AS transcript
        SET status = 'cancelled', updated_at = clock_timestamp()
        FROM cancelled
        WHERE transcript.outbound_message_id = cancelled.id
      `);
      const result = await tx.execute(sql<{
        id: string;
        customer_phone: string;
        message_type: 'text' | 'image' | 'document';
        text_body: string;
        media_storage_key: string | null;
        media_mime_type: 'image/jpeg' | 'image/png' | 'application/pdf' | null;
      }>`
        WITH candidate AS (
          SELECT outbound.id
          FROM whatsapp_outbound_messages AS outbound
          LEFT JOIN whatsapp_conversations AS conversation
            ON conversation.id = outbound.conversation_id
          WHERE outbound.status = 'pending'
            AND outbound.text_body IS NOT NULL
            AND (
              outbound.message_type = 'text'
              OR (outbound.message_type = 'image'
                AND outbound.media_storage_key IS NOT NULL
                AND outbound.media_mime_type IN ('image/jpeg', 'image/png'))
              OR (outbound.message_type = 'document' AND outbound.media_storage_key IS NOT NULL AND outbound.media_mime_type = 'application/pdf')
            )
            AND (outbound.expires_at IS NULL OR outbound.expires_at > now())
            AND (
              outbound.source <> 'bot'
              OR conversation.id IS NULL
              OR conversation.mode = 'bot'
            )
          ORDER BY outbound.created_at, outbound.id
          FOR UPDATE OF outbound SKIP LOCKED
          LIMIT 1
        )
        UPDATE whatsapp_outbound_messages AS outbound
        SET status = 'processing',
            attempt_count = outbound.attempt_count + 1,
            updated_at = clock_timestamp()
        FROM candidate
        WHERE outbound.id = candidate.id
        RETURNING outbound.id, outbound.customer_phone,
          outbound.message_type, outbound.text_body,
          outbound.media_storage_key, outbound.media_mime_type
      `);
      const rows = result as unknown as Array<{
        id: string;
        customer_phone: string;
        message_type: 'text' | 'image' | 'document';
        text_body: string;
        media_storage_key: string | null;
        media_mime_type: 'image/jpeg' | 'image/png' | 'application/pdf' | null;
      }>;
      const row = rows[0];
      if (row === undefined) return null;
      if (row.message_type === 'text') {
        return {
          id: row.id,
          customerPhone: row.customer_phone,
          messageType: 'text',
          textBody: row.text_body,
        };
      }
      if (row.message_type === 'document')
        return {
          id: row.id,
          customerPhone: row.customer_phone,
          messageType: 'document',
          textBody: row.text_body,
          mediaStorageKey: row.media_storage_key!,
          mediaMimeType: 'application/pdf',
        };
      return {
        id: row.id,
        customerPhone: row.customer_phone,
        messageType: 'image',
        textBody: row.text_body,
        mediaStorageKey: row.media_storage_key!,
        mediaMimeType: row.media_mime_type as 'image/jpeg' | 'image/png',
      };
    });
  }

  async markSent(id: string, whatsappMessageId: string): Promise<void> {
    await this.database.orm.execute(sql`
      WITH sent AS (
        UPDATE whatsapp_outbound_messages
        SET status = 'sent', whatsapp_message_id = ${whatsappMessageId},
          error_code = NULL, updated_at = clock_timestamp()
        WHERE id = ${id} AND status = 'processing'
        RETURNING id
      )
      UPDATE whatsapp_conversation_messages AS transcript
      SET status = 'sent', provider_message_id = ${whatsappMessageId},
        updated_at = clock_timestamp()
      FROM sent
      WHERE transcript.outbound_message_id = sent.id
    `);
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    await this.database.orm.execute(sql`
      WITH failed AS (
        UPDATE whatsapp_outbound_messages
        SET status = 'failed', error_code = ${errorCode.slice(0, 64)},
          updated_at = clock_timestamp()
        WHERE id = ${id} AND status = 'processing'
        RETURNING id
      )
      UPDATE whatsapp_conversation_messages AS transcript
      SET status = 'failed', updated_at = clock_timestamp()
      FROM failed
      WHERE transcript.outbound_message_id = failed.id
    `);
  }
}
