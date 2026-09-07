import { and, eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { whatsappOutboundMessages } from '../../database/schema.js';
import type {
  ClaimedOutboundMessage,
  OutboxWorkerRepository,
} from './outbox-worker.js';

export type EnqueueTextInput = Readonly<{
  conversationId?: string;
  customerPhone: string;
  body: string;
  idempotencyKey: string;
}>;

export type EnqueueImageInput = Readonly<{
  conversationId?: string;
  customerPhone: string;
  caption: string;
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png';
  idempotencyKey: string;
}>;

export class PostgresOutboundRepository implements OutboxWorkerRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async enqueueText(
    input: EnqueueTextInput,
  ): Promise<Readonly<{ id: string }>> {
    const [inserted] = await this.database.orm
      .insert(whatsappOutboundMessages)
      .values({
        ...(input.conversationId === undefined
          ? {}
          : { conversationId: input.conversationId }),
        customerPhone: input.customerPhone,
        idempotencyKey: input.idempotencyKey,
        messageType: 'text',
        textBody: input.body,
      })
      .onConflictDoNothing({
        target: whatsappOutboundMessages.idempotencyKey,
      })
      .returning({ id: whatsappOutboundMessages.id });
    if (inserted !== undefined) return inserted;

    const [existing] = await this.database.orm
      .select({ id: whatsappOutboundMessages.id })
      .from(whatsappOutboundMessages)
      .where(eq(whatsappOutboundMessages.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing === undefined) throw new Error('Outbound enqueue failed');
    return existing;
  }

  async enqueueImage(
    input: EnqueueImageInput,
  ): Promise<Readonly<{ id: string }>> {
    const [inserted] = await this.database.orm
      .insert(whatsappOutboundMessages)
      .values({
        ...(input.conversationId === undefined
          ? {}
          : { conversationId: input.conversationId }),
        customerPhone: input.customerPhone,
        idempotencyKey: input.idempotencyKey,
        messageType: 'image',
        textBody: input.caption,
        mediaStorageKey: input.storageKey,
        mediaMimeType: input.mimeType,
      })
      .onConflictDoNothing({
        target: whatsappOutboundMessages.idempotencyKey,
      })
      .returning({ id: whatsappOutboundMessages.id });
    if (inserted !== undefined) return inserted;
    const [existing] = await this.database.orm
      .select({ id: whatsappOutboundMessages.id })
      .from(whatsappOutboundMessages)
      .where(eq(whatsappOutboundMessages.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing === undefined) throw new Error('Outbound enqueue failed');
    return existing;
  }

  async claimNext(): Promise<ClaimedOutboundMessage | null> {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE whatsapp_outbound_messages AS outbound
        SET status = 'cancelled', updated_at = clock_timestamp()
        FROM whatsapp_conversations AS conversation
        WHERE outbound.conversation_id = conversation.id
          AND outbound.status = 'pending'
          AND conversation.mode = 'human'
      `);
      const result = await tx.execute(sql<{
        id: string;
        customer_phone: string;
        message_type: 'text' | 'image';
        text_body: string;
        media_storage_key: string | null;
        media_mime_type: 'image/jpeg' | 'image/png' | null;
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
            )
            AND (outbound.expires_at IS NULL OR outbound.expires_at > now())
            AND (conversation.id IS NULL OR conversation.mode = 'bot')
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
        message_type: 'text' | 'image';
        text_body: string;
        media_storage_key: string | null;
        media_mime_type: 'image/jpeg' | 'image/png' | null;
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
      return {
        id: row.id,
        customerPhone: row.customer_phone,
        messageType: 'image',
        textBody: row.text_body,
        mediaStorageKey: row.media_storage_key!,
        mediaMimeType: row.media_mime_type!,
      };
    });
  }

  async markSent(id: string, whatsappMessageId: string): Promise<void> {
    await this.database.orm
      .update(whatsappOutboundMessages)
      .set({
        status: 'sent',
        whatsappMessageId,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappOutboundMessages.id, id),
          eq(whatsappOutboundMessages.status, 'processing'),
        ),
      );
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    await this.database.orm
      .update(whatsappOutboundMessages)
      .set({
        status: 'failed',
        errorCode: errorCode.slice(0, 64),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappOutboundMessages.id, id),
          eq(whatsappOutboundMessages.status, 'processing'),
        ),
      );
  }
}
